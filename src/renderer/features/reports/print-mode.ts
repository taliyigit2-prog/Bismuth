// True inside the print layout (print-layout.tsx): report cards show their table, no switches or menus.
import { createContext, useContext } from 'react'

export const PrintModeContext = createContext(false)
export const usePrintMode = (): boolean => useContext(PrintModeContext)
