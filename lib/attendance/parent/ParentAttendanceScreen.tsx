import { ScrollView } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import StateView from '../../../components/core/StateView';
import { useChildrenAttendance } from './useChildrenAttendance';
import { ChildAttendanceRow } from './ChildAttendanceRow';

export function ParentAttendanceScreen() {
  const { state, children, errorText, refetch } = useChildrenAttendance();

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <StateView
        state={state}
        emptyText="No children are actively enrolled this session."
        errorText={errorText ?? 'Could not load attendance. Please try again.'}
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
