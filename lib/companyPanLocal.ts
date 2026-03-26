const key = (companyId: string) => `ems.companyPan.${encodeURIComponent(companyId)}`;

/** Last-resort PAN for this browser when Company GET omits stored text (field permissions, caching, etc.). */
export function getStoredCompanyPan(companyId: string): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(key(companyId))?.trim() ?? "";
  } catch {
    return "";
  }
}

export function setStoredCompanyPan(companyId: string, pan: string): void {
  if (typeof window === "undefined") return;
  try {
    const t = pan.trim();
    if (!t) localStorage.removeItem(key(companyId));
    else localStorage.setItem(key(companyId), t.toUpperCase());
  } catch {
    /* quota / private mode */
  }
}
