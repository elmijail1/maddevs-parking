import { passwordMaxLength } from "@parking/shared";
import { Button, InputAdornment, TextField, type TextFieldProps } from "@mui/material";
import { useState } from "react";

export function PasswordField({ toggleName, ...props }: TextFieldProps & { toggleName: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      {...props}
      type={visible ? "text" : "password"}
      slotProps={{
        htmlInput: { maxLength: passwordMaxLength },
        input: {
          endAdornment: (
            <InputAdornment position="end">
              <Button
                size="small"
                aria-label={`${visible ? "Hide" : "Show"} ${toggleName}`}
                aria-pressed={visible}
                onClick={() => setVisible(!visible)}
              >
                {visible ? "Hide" : "Show"}
              </Button>
            </InputAdornment>
          ),
        },
      }}
    />
  );
}
