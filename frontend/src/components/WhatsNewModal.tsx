import { changelog } from "../changelog";
import { Modal } from "./Forms";
import ChangelogList from "./ChangelogList";

export default function WhatsNewModal({ onClose }: { onClose: () => void }) {
  const latest = changelog[0];
  return (
    <Modal title="Co nowego" onClose={onClose}>
      <div className="p-5 sm:p-6">
        {latest ? (
          <ChangelogList releases={[latest]} />
        ) : (
          <p className="text-sm text-muted">Brak informacji o zmianach.</p>
        )}
      </div>
    </Modal>
  );
}
