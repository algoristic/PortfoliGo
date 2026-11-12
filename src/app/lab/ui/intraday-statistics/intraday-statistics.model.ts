/** One measure of the intraday table with its values as text. */
export interface IntradayRowView {
  id: string;
  label: string;
  stocks: string;
  worldIndex: string;
  bridge: string;
  reference: string;
}

export interface ProfileBar {
  part: number;
  /** Relative volatility of the part (1 = whole session). */
  value: number;
  /** Height in percent of the highest bar. */
  height: number;
  title: string;
}
