import React, { useCallback } from 'react';
import {
  css,
  Banner,
  InfoModal,
  Link,
  spacing,
  Body,
  BannerVariant,
} from '@mongodb-js/compass-components';
import {
  useTrackOnChange,
  type TrackFunction,
} from '@mongodb-js/compass-telemetry/provider';

const modalBodyStyles = css({
  marginTop: spacing[3],
  marginBottom: spacing[2],
});

const DESCRIPTION =
  'Some documented MongoDB features may work differently, be entirely missing' +
  ' or incomplete, or have unexpected performance characteristics. ';
const WARNING_BANNER =
  'This server or service appears to be an emulation of MongoDB rather than an official MongoDB product.';
const LEARN_MORE_URL =
  'https://www.mongodb.com/docs/compass/master/faq/#why-am-i-seeing-a-warning-about-a-non-genuine-mongodb-server-';
const MODAL_TITLE = 'Non-Genuine MongoDB Detected';

function NonGenuineWarningModal({
  isVisible,
  toggleIsVisible,
}: {
  isVisible: boolean;
  toggleIsVisible: (visible: boolean) => void;
}) {
  const onClose = useCallback(() => {
    toggleIsVisible(false);
  }, [toggleIsVisible]);

  useTrackOnChange(
    (track: TrackFunction) => {
      if (isVisible) {
        track('Screen', { name: 'non_genuine_mongodb_modal' });
      }
    },
    [isVisible],
    undefined
  );

  return (
    <InfoModal
      title={MODAL_TITLE}
      open={isVisible}
      data-testid="non-genuine-mongodb-modal"
      showCloseButton={true}
      closeButtonText="Continue"
      onClose={onClose}
    >
      <Banner variant={BannerVariant.Warning}>{WARNING_BANNER}</Banner>
      <Body className={modalBodyStyles}>{DESCRIPTION}</Body>
      <Link
        href={LEARN_MORE_URL}
        target="_blank"
        data-testid="non-genuine-warning-modal-learn-more-link"
      >
        Learn more
      </Link>
    </InfoModal>
  );
}

export default NonGenuineWarningModal;
