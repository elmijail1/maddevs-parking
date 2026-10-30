import { changeEmailRequestSchema, changePasswordFormSchema, emailMaxLength, type AuthUser } from "@parking/shared";
import { Alert, Backdrop, Button, CircularProgress, Paper, TextField, Typography } from "@mui/material";
import { useIsMutating, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { ApiRequestError } from "../api-request";
import { currentUserQueryKey } from "../auth/api";
import { clearUserData, useBroadcastAuth } from "../auth/auth-sync";
import { useCurrentUser } from "../auth/use-current-user";
import { PasswordField } from "../components/PasswordField";
import { collectErrors } from "../forms";
import { changeEmail, changePassword, logOut } from "./api";

type EditorName = "email" | "password";

const fieldErrorMessages: Record<string, { field: string; message: string }> = {
  email_taken: { field: "email", message: "Email already in use, try another" },
  wrong_password: { field: "currentPassword", message: "Wrong password" },
};

type EditorProps = { onSaved: (notice: string) => void; onFailed: () => void; onCancel: () => void };

function useEditorForm<T extends Record<string, string>>(initial: T) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fieldProps = (name: keyof T & string, label: string) => ({
    id: `profile-${name}`,
    label,
    value: values[name],
    onChange: (event: { target: { value: string } }) => {
      setValues((current) => ({ ...current, [name]: event.target.value }));
      setErrors(({ [name]: _, ...rest }) => rest);
    },
    error: Boolean(errors[name]),
    helperText: errors[name] ?? " ",
    fullWidth: true,
  });
  return { values, setErrors, fieldProps };
}

function handleSaveError(error: Error, setErrors: (errors: Record<string, string>) => void, onFailed: () => void) {
  if (!(error instanceof ApiRequestError)) {
    return;
  }
  const known = fieldErrorMessages[error.code];
  if (known) {
    setErrors({ [known.field]: known.message });
  } else {
    onFailed();
  }
}

function EditorActions({ onCancel }: { onCancel: () => void }) {
  return (
    <div className="flex gap-2">
      <Button type="submit" variant="contained">
        Save
      </Button>
      <Button onClick={onCancel}>Cancel</Button>
    </div>
  );
}

function EmailEditor({ user, onSaved, onFailed, onCancel }: EditorProps & { user: AuthUser }) {
  const queryClient = useQueryClient();
  const broadcastAuth = useBroadcastAuth();
  const { values, setErrors, fieldProps } = useEditorForm({ email: user.email, currentPassword: "" });
  const mutation = useMutation({
    mutationFn: changeEmail,
    onSuccess: (updated) => {
      queryClient.setQueryData(currentUserQueryKey, updated);
      broadcastAuth({ type: "user-changed" });
      onSaved("Your email was changed.");
    },
    onError: (error) => handleSaveError(error, setErrors, onFailed),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const result = changeEmailRequestSchema.safeParse(values);
    if (!result.success) {
      setErrors(collectErrors(result.error));
      return;
    }
    mutation.mutate(result.data);
  }

  return (
    <form noValidate onSubmit={handleSubmit} aria-label="Edit email" className="flex flex-col gap-2">
      <TextField
        {...fieldProps("email", "New email")}
        type="email"
        autoComplete="email"
        autoFocus
        slotProps={{ htmlInput: { maxLength: emailMaxLength } }}
      />
      <PasswordField
        {...fieldProps("currentPassword", "Current password")}
        autoComplete="current-password"
        toggleName="current password"
      />
      <EditorActions onCancel={onCancel} />
    </form>
  );
}

function PasswordEditor({ onSaved, onFailed, onCancel }: EditorProps) {
  const { values, setErrors, fieldProps } = useEditorForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const mutation = useMutation({
    mutationFn: changePassword,
    onSuccess: () => onSaved("Your password was changed."),
    onError: (error) => handleSaveError(error, setErrors, onFailed),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const result = changePasswordFormSchema.safeParse(values);
    if (!result.success) {
      setErrors(collectErrors(result.error));
      return;
    }
    mutation.mutate({ currentPassword: result.data.currentPassword, newPassword: result.data.newPassword });
  }

  return (
    <form noValidate onSubmit={handleSubmit} aria-label="Edit password" className="flex flex-col gap-2">
      <PasswordField
        {...fieldProps("currentPassword", "Current password")}
        autoComplete="current-password"
        toggleName="current password"
        autoFocus
      />
      <PasswordField
        {...fieldProps("newPassword", "New password")}
        autoComplete="new-password"
        toggleName="new password"
      />
      <PasswordField
        {...fieldProps("confirmPassword", "Confirm your new password")}
        autoComplete="new-password"
        toggleName="new password confirmation"
      />
      <EditorActions onCancel={onCancel} />
    </form>
  );
}

function ProfileSection({
  label,
  value,
  editLabel,
  editDisabled,
  onEdit,
  editor,
}: {
  label: string;
  value: string;
  editLabel: string;
  editDisabled: boolean;
  onEdit: () => void;
  editor: ReactNode;
}) {
  return (
    <Paper component="section" aria-label={label} className="flex flex-col gap-3 p-6">
      <Typography variant="subtitle2" color="text.secondary">
        {label}
      </Typography>
      {editor ?? (
        <div className="flex items-center justify-between gap-4">
          <Typography className="break-all">{value}</Typography>
          <Button variant="outlined" aria-label={editLabel} disabled={editDisabled} onClick={onEdit}>
            Edit
          </Button>
        </div>
      )}
    </Paper>
  );
}

export function ProfilePage() {
  const queryClient = useQueryClient();
  const broadcastAuth = useBroadcastAuth();
  const { data: user, refetch, isFetching } = useCurrentUser();
  const [editor, setEditor] = useState<EditorName | null>(null);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const saving = useIsMutating() > 0;

  const logout = useMutation({
    mutationFn: logOut,
    onSuccess: () => {
      clearUserData(queryClient);
      queryClient.setQueryData(currentUserQueryKey, null);
      broadcastAuth({ type: "logged-out" });
    },
    onError: () => setFailed(true),
  });

  if (!user) {
    return null;
  }

  const editorProps = {
    onSaved: (message: string) => {
      setEditor(null);
      setNotice(message);
    },
    onFailed: () => setFailed(true),
    onCancel: () => setEditor(null),
  };
  const openEditor = (name: EditorName) => {
    setNotice(null);
    setEditor(name);
  };

  async function reload() {
    setEditor(null);
    setNotice(null);
    await refetch();
    setFailed(false);
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-8">
      <Typography variant="h4" component="h1">
        My Profile
      </Typography>

      {failed ? (
        <div className="flex flex-col items-center gap-4 text-center">
          <Typography color="error">Your changes couldn't be saved. Please reload the page.</Typography>
          <Button variant="contained" onClick={() => void reload()} disabled={isFetching}>
            Reload
          </Button>
        </div>
      ) : (
        <>
          {notice && <Alert severity="success">{notice}</Alert>}
          <ProfileSection
            label="Your email"
            value={user.email}
            editLabel="Edit email"
            editDisabled={editor !== null}
            onEdit={() => openEditor("email")}
            editor={editor === "email" ? <EmailEditor user={user} {...editorProps} /> : null}
          />
          <ProfileSection
            label="Your password"
            value="••••••••"
            editLabel="Edit password"
            editDisabled={editor !== null}
            onEdit={() => openEditor("password")}
            editor={editor === "password" ? <PasswordEditor {...editorProps} /> : null}
          />
          <Button variant="outlined" color="error" className="self-start" onClick={() => logout.mutate()}>
            Log out
          </Button>
        </>
      )}

      <Backdrop open={saving} sx={{ zIndex: (theme) => theme.zIndex.modal + 1 }}>
        <CircularProgress aria-label="Saving" />
      </Backdrop>
    </main>
  );
}
