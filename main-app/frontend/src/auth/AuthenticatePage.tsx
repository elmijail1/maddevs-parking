import { emailMaxLength, loginFormSchema, signupFormSchema, type AuthUser } from "@parking/shared";
import { Alert, Button, Paper, Tab, Tabs, TextField, Typography } from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { PasswordField } from "../components/PasswordField";
import { collectErrors } from "../forms";
import { AuthRequestError, currentUserQueryKey, logIn, signUp } from "./api";

type Mode = "login" | "signup";

const fields = {
  login: [
    { name: "email", label: "Email", type: "email", autoComplete: "email" },
    { name: "password", label: "Password", type: "password", autoComplete: "current-password", toggleName: "password" },
  ],
  signup: [
    { name: "email", label: "Email", type: "email", autoComplete: "email" },
    { name: "password", label: "Password", type: "password", autoComplete: "new-password", toggleName: "password" },
    {
      name: "confirmPassword",
      label: "Confirm your password",
      type: "password",
      autoComplete: "new-password",
      toggleName: "password confirmation",
    },
  ],
} as const;

const serverErrorMessages: Record<string, { field?: string; message: string }> = {
  invalid_credentials: { message: "Wrong email or password." },
  email_taken: { field: "email", message: "This email is already in use" },
  invalid_request: { message: "Check the fields and try again." },
};

function AuthForm({ mode }: { mode: Mode }) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields[mode].map((field) => [field.name, ""])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (): Promise<AuthUser> => {
      if (mode === "login") {
        return logIn(loginFormSchema.parse(values));
      }
      const { email, password } = signupFormSchema.parse(values);
      return signUp({ email, password });
    },
    onSuccess: (user) => queryClient.setQueryData(currentUserQueryKey, user),
    onError: (error) => {
      const known = error instanceof AuthRequestError ? serverErrorMessages[error.code] : undefined;
      if (known?.field) {
        setErrors({ [known.field]: known.message });
      } else {
        setFormError(known?.message ?? "Something went wrong. Please try again.");
      }
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const schema = mode === "login" ? loginFormSchema : signupFormSchema;
    const result = schema.safeParse(values);
    if (!result.success) {
      setErrors(collectErrors(result.error));
      return;
    }
    setErrors({});
    mutation.mutate();
  }

  const submitLabel = mode === "login" ? "Log in" : "Sign up";

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-2" aria-label={submitLabel}>
      {fields[mode].map((field) => {
        const props = {
          id: `${mode}-${field.name}`,
          label: field.label,
          autoComplete: field.autoComplete,
          value: values[field.name],
          onChange: (event: ChangeEvent<HTMLInputElement>) => {
            setValues((current) => ({ ...current, [field.name]: event.target.value }));
            setErrors(({ [field.name]: _, ...rest }) => rest);
          },
          error: Boolean(errors[field.name]),
          helperText: errors[field.name] ?? " ",
          fullWidth: true,
        };
        return "toggleName" in field ? (
          <PasswordField key={field.name} {...props} toggleName={field.toggleName} />
        ) : (
          <TextField
            key={field.name}
            {...props}
            type={field.type}
            slotProps={{ htmlInput: { maxLength: emailMaxLength } }}
          />
        );
      })}
      {formError && <Alert severity="error">{formError}</Alert>}
      <Button
        type="submit"
        variant="contained"
        size="large"
        disabled={mutation.isPending}
        className="mt-2 w-48 self-center py-3"
      >
        {mutation.isPending ? "Please wait…" : submitLabel}
      </Button>
    </form>
  );
}

export function AuthenticatePage() {
  const [mode, setMode] = useState<Mode>("login");

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <Paper className="flex w-full max-w-md flex-col gap-4 p-8">
        <Typography variant="h4" component="h1">
          Parking
        </Typography>
        <Tabs value={mode} onChange={(_, value: Mode) => setMode(value)} variant="fullWidth">
          <Tab label="Log in" value="login" />
          <Tab label="Sign up" value="signup" />
        </Tabs>
        <AuthForm key={mode} mode={mode} />
      </Paper>
    </main>
  );
}
