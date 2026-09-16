import type { ChangelogRelease } from "../changelog";
import { Modal } from "./Forms";
import ChangelogList from "./ChangelogList";

export default function WhatsNewModal({
  releases,
  onClose,
}: {
  releases: ChangelogRelease[];
  onClose: () => void;
}) {
  return (
    <Modal title="Co nowego" onClose={onClose}>
      <div className="p-5 sm:p-6">
        <ChangelogList releases={releases} />
      </div>
    </Modal>
  );
}
