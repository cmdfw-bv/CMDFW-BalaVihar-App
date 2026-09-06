import '../../unistyles';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import Card from '../../../components/core/Card';
import ListRow from '../../../components/core/ListRow';
import StatTile from '../../../components/core/StatTile';
import StatusChip from '../../../components/core/StatusChip';
import type { ChildAttendance } from './childAttendanceStats';

export function ChildAttendanceRow({ child }: { child: ChildAttendance }) {
  return (
    <Card tone="surface">
      <ListRow leading={null} title={child.name} subtitle={`${child.className} · ${child.gradeBand}`} />
      {child.percent === null ? (
        <StatusChip status="neutral">No attendance recorded yet</StatusChip>
      ) : (
        <View style={styles.stats}>
          <StatTile label="Present" value={child.present} />
          <StatTile label="Absent" value={child.absent} />
          <StatTile label="Attendance %" value={`${child.percent}%`} accent />
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create((theme) => ({
  stats: { flexDirection: 'row', gap: theme.space['5'], marginTop: theme.space['3'] },
}));
