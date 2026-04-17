import type { ButtonHTMLAttributes } from "react";

export function Button(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={
        "px-4 py-2 rounded bg-black text-white hover:opacity-80 " +
        (props.className ?? "")
      }
    />
  );
}
