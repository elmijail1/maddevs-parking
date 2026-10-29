import { describe, expect, it } from "vitest";
import { changePasswordFormSchema, emailSchema, loginFormSchema, signupFormSchema, signupPasswordSchema } from "./auth";

const firstError = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues[0]?.message;

describe("emailSchema", () => {
  it("trims and lowercases the email", () => {
    expect(emailSchema.parse("  John.Doe@Example.COM ")).toBe("john.doe@example.com");
  });

  it.each([
    ["", "Enter your email"],
    ["   ", "Enter your email"],
    ["john", "Enter a valid email"],
    ["john@", "Enter a valid email"],
    [`${"a".repeat(89)}@example.com`, "Email must be at most 100 characters"],
  ])("rejects %j", (email, message) => {
    expect(firstError(emailSchema.safeParse(email))).toBe(message);
  });

  it("accepts an email of exactly 100 characters", () => {
    expect(emailSchema.safeParse(`${"a".repeat(88)}@example.com`).success).toBe(true);
  });
});

describe("signupPasswordSchema", () => {
  it.each(["abcdef1!", "Pa$$w0rd", "x".repeat(28) + "1~", "a1[]{}()<>"])("accepts %j", (password) => {
    expect(signupPasswordSchema.safeParse(password).success).toBe(true);
  });

  it.each([
    ["", "Enter a password"],
    ["ab1!", "Password must be at least 8 characters"],
    ["a1!" + "x".repeat(28), "Password must be at most 30 characters"],
    ["abcd 1234!", "Use only Latin letters, digits and special characters like !@#$%"],
    ["пароль12!", "Use only Latin letters, digits and special characters like !@#$%"],
    ["abcdéf1!", "Use only Latin letters, digits and special characters like !@#$%"],
    ["12345678!", "Password must include a Latin letter"],
    ["abcdefgh!", "Password must include a digit"],
    ["abcdefgh1", "Password must include a special character"],
  ])("rejects %j", (password, message) => {
    expect(firstError(signupPasswordSchema.safeParse(password))).toBe(message);
  });
});

describe("loginFormSchema", () => {
  it("only requires a valid email and a password of at least 8 characters", () => {
    expect(loginFormSchema.safeParse({ email: "a@b.co", password: "abcdefgh" }).success).toBe(true);
    expect(firstError(loginFormSchema.safeParse({ email: "a@b.co", password: "" }))).toBe("Enter your password");
    expect(firstError(loginFormSchema.safeParse({ email: "a@b.co", password: "abc" }))).toBe(
      "Password must be at least 8 characters",
    );
  });
});

describe("signupFormSchema", () => {
  it("requires the passwords to match", () => {
    const result = signupFormSchema.safeParse({ email: "a@b.co", password: "abcdef1!", confirmPassword: "abcdef1?" });
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ path: ["confirmPassword"], message: "Passwords don't match" }),
    ]);
  });
});

describe("changePasswordFormSchema", () => {
  it("applies the signup rules to the new password and requires the current one and a matching confirmation", () => {
    const issues = (form: object) => changePasswordFormSchema.safeParse(form).error?.issues.map((i) => i.message) ?? [];

    expect(issues({ currentPassword: "old", newPassword: "abcdef1!", confirmPassword: "abcdef1!" })).toEqual([]);
    expect(issues({ currentPassword: "", newPassword: "abcdef1!", confirmPassword: "abcdef1!" })).toEqual([
      "Enter your current password",
    ]);
    expect(issues({ currentPassword: "old", newPassword: "abcdefgh", confirmPassword: "abcdefgh" })).toEqual([
      "Password must include a digit",
      "Password must include a special character",
    ]);
    expect(issues({ currentPassword: "old", newPassword: "abcdef1!", confirmPassword: "abcdef1?" })).toEqual([
      "Passwords don't match",
    ]);
  });
});
