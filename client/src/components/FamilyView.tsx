import ApprovalsInbox from './ApprovalsInbox';
import JoinCodeCard from './JoinCodeCard';
import ChildrenView from './ChildrenView';

/** The parent's home: approvals first, then each kid's card, then the join code. */
export default function FamilyView() {
  return (
    <div>
      <div className="px-4 pt-4">
        <ApprovalsInbox />
      </div>
      <ChildrenView />
      <div className="px-4 pb-4">
        <JoinCodeCard />
      </div>
    </div>
  );
}
