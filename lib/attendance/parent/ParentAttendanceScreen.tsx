import '../../unistyles';
import { ScrollView } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import StateView from '../../../components/core/StateView';
import { useChildrenAttendance } from './useChildrenAttendance';
import { ChildAttendanceRow } from './ChildAttendanceRow';

export function ParentAttendanceScreen() {
  const { state, children, refetch } = useChildrenAttendance();

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <StateView
        state={state}
        emptyText="No children are actively enrolled this session."
        // Fixed copy, never the database error text — see useChildrenAttendance's error branch
        // (PR #51 review, Important #2). The hook no longer exposes an errorText field at all, so
        // a future edit cannot reintroduce the disclosure by wiring one back through.
        errorText="Could not load attendance. Please try again."
        onRetry={refetch}
      >
        {children.map((child) => (
          <ChildAttendanceRow key={child.enrollmentId} child={child} />
        ))}
      </StateView>
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme) => ({
  content: { padding: theme.space['4'], gap: theme.space['3'] },
}));
