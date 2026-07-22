import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Code,
  Group,
  Modal,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { PageHeader } from "../components/PageHeader";
import { useApi } from "../useApi";

type HelmUser = {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  mustChangePassword?: boolean;
};

type ResetResponse = HelmUser & {
  emailSent?: boolean;
  temporaryPassword?: string;
};

export function UsersAdminPage() {
  const { user } = useAuth();
  const { request } = useApi();
  const qc = useQueryClient();
  const [confirmUser, setConfirmUser] = useState<HelmUser | null>(null);
  const [lastTempPassword, setLastTempPassword] = useState<{
    email: string;
    password: string;
  } | null>(null);

  const isLead = user?.role === "lead";

  const usersQuery = useQuery({
    queryKey: ["helm-users"],
    enabled: isLead,
    queryFn: async () => {
      const res = await request("/api/users");
      if (!res.ok) throw new Error("load_failed");
      const data = (await res.json()) as { users: HelmUser[] };
      return data.users;
    },
  });

  const resetMut = useMutation({
    mutationFn: async (target: HelmUser) => {
      const res = await request(`/api/users/${target.id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => ({}))) as ResetResponse & {
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "reset_failed");
      }
      return data;
    },
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["helm-users"] });
      if (data.temporaryPassword) {
        setLastTempPassword({
          email: data.email,
          password: data.temporaryPassword,
        });
      } else {
        setLastTempPassword(null);
      }
      setConfirmUser(null);
    },
  });

  if (!isLead) {
    return <Navigate to="/" replace />;
  }

  const users = usersQuery.data ?? [];

  return (
    <Stack gap="md">
      <PageHeader
        eyebrow="Settings"
        title="Sign-in users"
        lead="Reset passwords for Helm accounts. The user must sign in with the temporary password and set a new one."
      />

      {lastTempPassword && (
        <Alert
          color="teal"
          title="Temporary password (dev)"
          withCloseButton
          onClose={() => setLastTempPassword(null)}
        >
          <Text size="sm" mb="xs">
            Temporary password for <strong>{lastTempPassword.email}</strong>. Share it
            securely; it is only shown here in non-production.
          </Text>
          <Group gap="sm" align="center">
            <Code>{lastTempPassword.password}</Code>
            <Button
              size="xs"
              variant="light"
              onClick={() =>
                void navigator.clipboard.writeText(lastTempPassword.password)
              }
            >
              Copy
            </Button>
          </Group>
        </Alert>
      )}

      {resetMut.isError && (
        <Alert color="red" title="Reset failed">
          {(resetMut.error as Error).message}
        </Alert>
      )}

      {usersQuery.isError && (
        <Alert color="red" title="Could not load users">
          Try again or check API logs.
        </Alert>
      )}

      <Table striped highlightOnHover withTableBorder aria-label="Sign-in users">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Name</Table.Th>
            <Table.Th>Email</Table.Th>
            <Table.Th>Role</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {users.map((u) => (
            <Table.Tr key={u.id}>
              <Table.Td>{u.displayName ?? "—"}</Table.Td>
              <Table.Td>{u.email}</Table.Td>
              <Table.Td>
                <Badge variant="light">{u.role}</Badge>
              </Table.Td>
              <Table.Td>
                {u.mustChangePassword ? (
                  <Badge color="orange" variant="light">
                    Must change password
                  </Badge>
                ) : (
                  <Badge color="gray" variant="light">
                    Active
                  </Badge>
                )}
              </Table.Td>
              <Table.Td>
                <Button
                  size="xs"
                  variant="light"
                  color="orange"
                  onClick={() => setConfirmUser(u)}
                  disabled={resetMut.isPending}
                >
                  Reset password
                </Button>
              </Table.Td>
            </Table.Tr>
          ))}
          {!usersQuery.isLoading && users.length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={5}>
                <Text c="dimmed" size="sm">
                  No users found.
                </Text>
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>

      <Modal
        opened={confirmUser != null}
        onClose={() => setConfirmUser(null)}
        title="Reset password"
        centered
      >
        <Stack gap="md">
          <Text size="sm">
            Reset password for{" "}
            <strong>{confirmUser?.displayName ?? confirmUser?.email}</strong> (
            {confirmUser?.email})? They will need the temporary password on next sign-in.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirmUser(null)}>
              Cancel
            </Button>
            <Button
              color="orange"
              loading={resetMut.isPending}
              onClick={() => {
                if (confirmUser) resetMut.mutate(confirmUser);
              }}
            >
              Send reset
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
