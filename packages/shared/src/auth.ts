import { z } from "zod";

export const emailMaxLength = 100;
export const passwordMinLength = 8;
export const passwordMaxLength = 30;

const allowedPasswordCharacters = /^[A-Za-z0-9!-/:-@[-`{-~]*$/;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Enter your email")
  .max(emailMaxLength, `Email must be at most ${emailMaxLength} characters`)
  .pipe(z.email("Enter a valid email"));

export const signupPasswordSchema = z
  .string()
  .min(1, "Enter a password")
  .min(passwordMinLength, `Password must be at least ${passwordMinLength} characters`)
  .max(passwordMaxLength, `Password must be at most ${passwordMaxLength} characters`)
  .regex(allowedPasswordCharacters, "Use only Latin letters, digits and special characters like !@#$%")
  .regex(/[A-Za-z]/, "Password must include a Latin letter")
  .regex(/[0-9]/, "Password must include a digit")
  .regex(/[^A-Za-z0-9]/, "Password must include a special character");

export const signupRequestSchema = z.object({
  email: emailSchema,
  password: signupPasswordSchema,
});
export type SignupRequest = z.infer<typeof signupRequestSchema>;

export const loginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().min(1).max(emailMaxLength),
  password: z.string().min(1).max(passwordMaxLength),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const loginFormSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(1, "Enter your password")
    .min(passwordMinLength, `Password must be at least ${passwordMinLength} characters`)
    .max(passwordMaxLength, `Password must be at most ${passwordMaxLength} characters`),
});

export const signupFormSchema = signupRequestSchema
  .extend({ confirmPassword: z.string().min(1, "Confirm your password") })
  .refine((form) => form.password === form.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords don't match",
  });

const currentPasswordSchema = z
  .string()
  .min(1, "Enter your current password")
  .max(passwordMaxLength, `Password must be at most ${passwordMaxLength} characters`);

export const changeEmailRequestSchema = z.object({
  email: emailSchema,
  currentPassword: currentPasswordSchema,
});
export type ChangeEmailRequest = z.infer<typeof changeEmailRequestSchema>;

export const changePasswordRequestSchema = z.object({
  currentPassword: currentPasswordSchema,
  newPassword: signupPasswordSchema,
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

export const changePasswordFormSchema = changePasswordRequestSchema
  .extend({ confirmPassword: z.string().min(1, "Confirm your new password") })
  .refine((form) => form.newPassword === form.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords don't match",
  });

export const authUserSchema = z.object({
  id: z.uuid(),
  email: z.string(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const authUserResponseSchema = z.object({
  user: authUserSchema,
});
export type AuthUserResponse = z.infer<typeof authUserResponseSchema>;

export const authErrorSchema = z.object({
  error: z.enum(["invalid_request", "invalid_credentials", "email_taken", "wrong_password", "unauthorized"]),
});
export type AuthError = z.infer<typeof authErrorSchema>["error"];
