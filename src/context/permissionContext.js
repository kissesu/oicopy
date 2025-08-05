import { createContext, useContext } from "react";
export const PermissionContext = createContext();
export function usePermissionContext() { return useContext(PermissionContext); }