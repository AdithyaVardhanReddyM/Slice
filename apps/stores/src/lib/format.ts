const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export const money = (n: number) => usd.format(n);

export const titleCase = (s: string) =>
  s.replace(/(^|\s|-)\w/g, (m) => m.toUpperCase()).replace(/-/g, " ");
