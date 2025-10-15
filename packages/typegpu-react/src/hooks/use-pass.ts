import { useContext } from "react";
import { PassContext, type PassContextValue } from "../context/pass-context.tsx";
  
export function usePass(): PassContextValue {
  const context = useContext(PassContext);
  if (!context) {
    throw new Error('This component must be a child of a Pass component');
  }
  return context;
};
