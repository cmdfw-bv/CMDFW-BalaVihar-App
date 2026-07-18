const ROLE_LABEL: Record<string, string> = {
  student: "Student",
  parent: "Parent",
  teacher: "Teacher",
  coordinator: "Coordinator",
  bv_coordinator: "BV Coordinator",
  admin: "Admin",
};

export function appHeaderSubtitle(
  activeRole: string | null,
  scopeType: string | null,
  scopeLabel?: string | null
): string {
  if (!activeRole) return "";
  const roleLabel = ROLE_LABEL[activeRole] ?? activeRole;
  const fallbackScope =
    activeRole === "parent"
      ? "My Children"
      : scopeType
        ? scopeType.charAt(0).toUpperCase() + scopeType.slice(1)
        : "";
  const resolvedScope = scopeLabel ?? fallbackScope;
  return resolvedScope ? `${roleLabel} · ${resolvedScope}` : roleLabel;
}
