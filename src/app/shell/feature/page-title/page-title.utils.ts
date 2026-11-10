export const APP_NAME = 'PortfoliGo';

export function formatPageTitle(pageTitle: string | undefined): string {
  return pageTitle ? `${pageTitle} · ${APP_NAME}` : APP_NAME;
}
