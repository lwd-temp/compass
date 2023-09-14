import React from 'react';
import { connect } from 'react-redux';
import type { SearchIndex, SearchIndexStatus } from 'mongodb-data-service';
import { withPreferences } from 'compass-preferences-model';

import { BadgeVariant } from '@mongodb-js/compass-components';
import {
  EmptyContent,
  Button,
  Link,
  Badge,
} from '@mongodb-js/compass-components';

import type { SearchSortColumn } from '../../modules/search-indexes';
import {
  SearchIndexesStatuses,
  openModalForCreation,
} from '../../modules/search-indexes';
import type { SearchIndexesStatus } from '../../modules/search-indexes';
import { sortSearchIndexes } from '../../modules/search-indexes';
import type { SortDirection, RootState } from '../../modules';

import { IndexesTable } from '../indexes-table';
import { ZeroGraphic } from './zero-graphic';

type SearchIndexesTableProps = {
  indexes: SearchIndex[];
  isWritable?: boolean;
  readOnly?: boolean;
  onSortTable: (column: SearchSortColumn, direction: SortDirection) => void;
  openCreateModal: () => void;
  status: SearchIndexesStatus;
};

function isReadyStatus(status: SearchIndexesStatus) {
  return (
    status === SearchIndexesStatuses.READY ||
    status === SearchIndexesStatuses.REFRESHING
  );
}

function ZeroState({ openCreateModal }: { openCreateModal: () => void }) {
  return (
    <EmptyContent
      icon={ZeroGraphic}
      title="No search indexes yet"
      subTitle="Atlas Search is an embedded full-text search in MongoDB Atlas that gives you a seamless, scalable experience for building relevance-based app features."
      callToAction={
        <Button
          onClick={openCreateModal}
          data-testid="create-atlas-search-index-button"
          variant="primary"
          size="small"
        >
          Create Atlas Search Index
        </Button>
      }
      callToActionLink={
        <span>
          Not sure where to start?&nbsp;
          <Link
            href="https://www.mongodb.com/docs/atlas/atlas-search/"
            target="_blank"
          >
            Visit our Docs
          </Link>
        </span>
      }
    />
  );
}

const statusBadgeVariants: Record<SearchIndexStatus, BadgeVariant> = {
  BUILDING: BadgeVariant.Blue,
  FAILED: BadgeVariant.Red,
  PENDING: BadgeVariant.Yellow,
  READY: BadgeVariant.Green,
  STALE: BadgeVariant.LightGray,
};

function IndexStatus({
  status,
  'data-testid': dataTestId,
}: {
  status: SearchIndexStatus;
  'data-testid': string;
}) {
  const variant = statusBadgeVariants[status];
  return (
    <Badge variant={variant} data-testid={dataTestId}>
      {status}
    </Badge>
  );
}

export const SearchIndexesTable: React.FunctionComponent<
  SearchIndexesTableProps
> = ({
  indexes,
  isWritable,
  readOnly,
  onSortTable,
  openCreateModal,
  status,
}) => {
  if (!isReadyStatus(status)) {
    // If there's an error or the search indexes are still pending or search
    // indexes aren't available, then that's all handled by the toolbar and we
    // don't render the table.
    return null;
  }

  if (indexes.length === 0) {
    return <ZeroState openCreateModal={openCreateModal} />;
  }

  const canModifyIndex = isWritable && !readOnly;

  const columns = ['Name and Fields', 'Status'] as const;

  const data = indexes.map((index) => {
    return {
      key: index.name,
      'data-testid': `row-${index.name}`,
      fields: [
        {
          'data-testid': 'name-field',
          children: index.name,
        },
        {
          'data-testid': 'status-field',
          children: (
            <IndexStatus
              status={index.status}
              data-testid={`search-indexes-status-${index.name}`}
            />
          ),
        },
      ],

      // TODO(COMPASS-7206): details for the nested row
    };
  });

  return (
    <IndexesTable
      data-testid="search-indexes"
      aria-label="Search Indexes"
      canModifyIndex={canModifyIndex}
      columns={columns}
      data={data}
      onSortTable={(column, direction) => onSortTable(column, direction)}
    />
  );
};

const mapState = ({ searchIndexes, isWritable }: RootState) => ({
  isWritable,
  indexes: searchIndexes.indexes,
  status: searchIndexes.status,
});

const mapDispatch = {
  onSortTable: sortSearchIndexes,
  openCreateModal: openModalForCreation,
};

export default connect(
  mapState,
  mapDispatch
)(withPreferences(SearchIndexesTable, ['readOnly'], React));
