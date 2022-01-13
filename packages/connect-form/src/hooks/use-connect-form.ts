import { useEffect, useReducer } from 'react';
import ConnectionStringUrl from 'mongodb-connection-string-url';
import { ConnectionInfo, ConnectionOptions } from 'mongodb-data-service';
import type { MongoClientOptions } from 'mongodb';

import {
  ConnectionFormError,
  ConnectionFormWarning,
  validateConnectionOptionsWarnings,
} from '../utils/validation';
import { getNextHost } from '../utils/get-next-host';
import { defaultHostname, defaultPort } from '../constants/default-connection';
import { checkForInvalidCharacterInHost } from '../utils/check-for-invalid-character-in-host';
import { tryUpdateConnectionStringSchema } from '../utils/connection-string-schema';
import {
  handleUpdateSshOptions,
  UpdateSshOptions,
} from '../utils/connection-ssh-handler';
import {
  handleUpdateTlsOption,
  UpdateTlsOptionAction,
} from '../utils/tls-options';
import ConnectionString from 'mongodb-connection-string-url';

export interface ConnectFormState {
  connectionOptions: ConnectionOptions;
  errors: ConnectionFormError[];
  warnings: ConnectionFormWarning[];
}

type Action =
  | {
      type: 'set-connection-form-state';
      newState: ConnectFormState;
    }
  | {
      type: 'set-form-errors';
      errors: ConnectionFormError[];
    };

function connectFormReducer(
  state: ConnectFormState,
  action: Action
): ConnectFormState {
  switch (action.type) {
    case 'set-connection-form-state':
      return {
        ...state,
        ...action.newState,
      };
    case 'set-form-errors':
      return {
        ...state,
        errors: action.errors,
      };
  }
}

// Actions for specific form fields

interface UpdateConnectionStringAction {
  type: 'update-connection-string';
  newConnectionStringValue: string;
}

interface UpdateHostAction {
  type: 'update-host';
  fieldIndex: number;
  newHostValue: string;
}

type ConnectionFormFieldActions =
  | UpdateConnectionStringAction
  | {
      type: 'add-new-host';
      fieldIndexToAddAfter: number;
    }
  | {
      type: 'remove-host';
      fieldIndexToRemove: number;
    }
  | UpdateHostAction
  | {
      type: 'update-direct-connection';
      isDirectConnection: boolean;
    }
  | {
      type: 'update-connection-schema';
      isSrv: boolean;
    }
  | UpdateSshOptions
  | UpdateTlsOptionAction
  | {
      type: 'update-search-param';
      currentKey: keyof MongoClientOptions;
      newKey?: keyof MongoClientOptions;
      value?: unknown;
    }
  | {
      type: 'delete-search-param';
      key: keyof MongoClientOptions;
    }
  | {
      type: 'update-connection-path';
      value: string;
    };

export type UpdateConnectionFormField = (
  action: ConnectionFormFieldActions
) => void;

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

function buildStateFromConnectionInfo(
  initialConnectionInfo: ConnectionInfo
): ConnectFormState {
  const [, errors] = parseConnectionString(
    initialConnectionInfo.connectionOptions.connectionString
  );
  return {
    errors: errors,
    warnings: errors
      ? []
      : validateConnectionOptionsWarnings(
          initialConnectionInfo.connectionOptions
        ),
    connectionOptions: deepClone(initialConnectionInfo.connectionOptions),
  };
}

function handleUpdateHost({
  action,
  connectionStringUrl,
  connectionOptions,
}: {
  action: UpdateHostAction;
  connectionStringUrl: ConnectionStringUrl;
  connectionOptions: ConnectionOptions;
}): {
  connectionOptions: ConnectionOptions;
  errors: ConnectionFormError[];
} {
  const { newHostValue, fieldIndex } = action;
  try {
    checkForInvalidCharacterInHost(newHostValue, connectionStringUrl.isSRV);

    if (connectionStringUrl.hosts.length === 1 && newHostValue === '') {
      throw new Error(
        'Host cannot be empty. The host is the address hostname, IP address, or UNIX domain socket where the mongodb instance is running.'
      );
    }

    const updatedConnectionString = connectionStringUrl.clone();
    updatedConnectionString.hosts[fieldIndex] = newHostValue || '';

    // Build a new connection string url to ensure the
    // validity of the update.
    const newConnectionStringUrl = new ConnectionStringUrl(
      updatedConnectionString.toString()
    );

    return {
      connectionOptions: {
        ...connectionOptions,
        connectionString: newConnectionStringUrl.toString(),
      },
      errors: [],
    };
  } catch (err) {
    // The host value is invalid, so we show the error and allow
    // the user to update it until we can update the
    // connection string url.
    return {
      connectionOptions: {
        ...connectionOptions,
        connectionString: connectionStringUrl.toString(),
      },
      errors: [
        {
          fieldName: 'hosts',
          fieldIndex,
          message: (err as Error).message,
        },
      ],
    };
  }
}

function parseConnectionString(
  connectionString: string
): [ConnectionString | undefined, ConnectionFormError[]] {
  try {
    const connectionStringUrl = new ConnectionString(connectionString);
    return [connectionStringUrl, []];
  } catch (err) {
    return [
      undefined,
      [
        {
          fieldName: 'connectionString',
          message: (err as Error)?.message,
        },
      ],
    ];
  }
}

// This function handles field updates from the connection form.
// It performs validity checks and downstream effects. Exported for testing.
export function handleConnectionFormFieldUpdate(
  action: ConnectionFormFieldActions,
  currentConnectionOptions: ConnectionOptions
): {
  connectionOptions: ConnectionOptions;
  errors?: ConnectionFormError[];
} {
  if (action.type === 'update-connection-string') {
    const [newParsedConnectionStringUrl, errors] = parseConnectionString(
      action.newConnectionStringValue
    );

    return {
      connectionOptions: {
        ...currentConnectionOptions,
        connectionString:
          newParsedConnectionStringUrl?.toString() ||
          action.newConnectionStringValue,
      },
      errors,
    };
  }

  const [parsedConnectionStringUrl, errors] = parseConnectionString(
    currentConnectionOptions.connectionString
  );

  if (!parsedConnectionStringUrl) {
    return {
      connectionOptions: currentConnectionOptions,
      errors: errors,
    };
  }

  const updatedSearchParams =
    parsedConnectionStringUrl.typedSearchParams<MongoClientOptions>();

  switch (action.type) {
    case 'add-new-host': {
      const { fieldIndexToAddAfter } = action;

      const newHost = getNextHost(
        parsedConnectionStringUrl.hosts,
        fieldIndexToAddAfter
      );
      parsedConnectionStringUrl.hosts.splice(
        fieldIndexToAddAfter + 1,
        0,
        newHost
      );
      if (updatedSearchParams.get('directConnection')) {
        updatedSearchParams.delete('directConnection');
      }

      return {
        connectionOptions: {
          ...currentConnectionOptions,
          connectionString: parsedConnectionStringUrl.toString(),
        },
      };
    }
    case 'remove-host': {
      const { fieldIndexToRemove } = action;

      parsedConnectionStringUrl.hosts.splice(fieldIndexToRemove, 1);

      if (
        parsedConnectionStringUrl.hosts.length === 1 &&
        !parsedConnectionStringUrl.hosts[0]
      ) {
        // If the user removes a host, leaving a single empty host, it will
        // create an invalid connection string. Here we default the value.
        parsedConnectionStringUrl.hosts[0] = `${defaultHostname}:${defaultPort}`;
      }

      return {
        connectionOptions: {
          ...currentConnectionOptions,
          connectionString: parsedConnectionStringUrl.toString(),
        },
      };
    }
    case 'update-tls-option': {
      return handleUpdateTlsOption({
        action,
        connectionStringUrl: parsedConnectionStringUrl,
        connectionOptions: currentConnectionOptions,
      });
    }
    case 'update-host': {
      return handleUpdateHost({
        action,
        connectionStringUrl: parsedConnectionStringUrl,
        connectionOptions: currentConnectionOptions,
      });
    }
    case 'update-direct-connection': {
      const { isDirectConnection } = action;
      if (isDirectConnection) {
        updatedSearchParams.set('directConnection', 'true');
      } else if (updatedSearchParams.get('directConnection')) {
        updatedSearchParams.delete('directConnection');
      }

      return {
        connectionOptions: {
          ...currentConnectionOptions,
          connectionString: parsedConnectionStringUrl.toString(),
        },
        errors: [],
      };
    }
    case 'update-connection-schema': {
      const { isSrv } = action;

      try {
        const newConnectionStringUrl = tryUpdateConnectionStringSchema(
          parsedConnectionStringUrl,
          isSrv
        );

        return {
          connectionOptions: {
            ...currentConnectionOptions,
            connectionString: newConnectionStringUrl.toString(),
          },
          errors: [],
        };
      } catch (err) {
        return {
          connectionOptions: {
            ...currentConnectionOptions,
          },
          errors: [
            {
              fieldName: 'isSrv',
              message: `Error updating connection schema: ${
                (err as Error).message
              }`,
            },
          ],
        };
      }
    }
    case 'update-ssh-options': {
      return handleUpdateSshOptions({
        action,
        connectionOptions: currentConnectionOptions,
      });
    }
    case 'update-search-param': {
      // User is trying to change the key of searchParam (w => journal)
      if (action.newKey) {
        const newValue =
          action.value ?? updatedSearchParams.get(action.currentKey);
        updatedSearchParams.delete(action.currentKey);
        updatedSearchParams.set(action.newKey, newValue);
      } else {
        updatedSearchParams.set(action.currentKey, action.value);
      }

      return {
        connectionOptions: {
          ...currentConnectionOptions,
          connectionString: parsedConnectionStringUrl.toString(),
        },
      };
    }
    case 'delete-search-param': {
      updatedSearchParams.delete(action.key);
      return {
        connectionOptions: {
          ...currentConnectionOptions,
          connectionString: parsedConnectionStringUrl.toString(),
        },
      };
    }
    case 'update-connection-path': {
      parsedConnectionStringUrl.pathname = action.value;
      return {
        connectionOptions: {
          ...currentConnectionOptions,
          connectionString: parsedConnectionStringUrl.toString(),
        },
      };
    }
  }
}

export function useConnectForm(initialConnectionInfo: ConnectionInfo): [
  ConnectFormState,
  {
    updateConnectionFormField: UpdateConnectionFormField;
    setErrors: (errors: ConnectionFormError[]) => void;
  }
] {
  const [state, dispatch] = useReducer(
    connectFormReducer,
    initialConnectionInfo,
    buildStateFromConnectionInfo
  );

  useEffect(() => {
    // When the initial connection options change, like a different
    // connection is clicked in the compass-sidebar, we
    // refresh the current connection string being edited.
    // We do this here to retain the tabs/expanded accordion states.
    const { errors, warnings, connectionOptions } =
      buildStateFromConnectionInfo(initialConnectionInfo);

    dispatch({
      type: 'set-connection-form-state',
      newState: {
        errors,
        warnings,
        connectionOptions,
      },
    });
  }, [initialConnectionInfo]);

  function updateConnectionFormField(action: ConnectionFormFieldActions) {
    const updatedState = handleConnectionFormFieldUpdate(
      action,
      state.connectionOptions
    );

    dispatch({
      type: 'set-connection-form-state',
      newState: {
        ...state,
        errors: [], // on each update the errors should reset
        ...updatedState,
        warnings: validateConnectionOptionsWarnings(
          updatedState.connectionOptions
        ),
      },
    });
  }

  return [
    state,
    {
      updateConnectionFormField,
      setErrors: (errors: ConnectionFormError[]) => {
        dispatch({
          type: 'set-form-errors',
          errors,
        });
      },
    },
  ];
}
