import type { Buyer } from "@/lib/types";

/** Vetted November 2026 for cash payout, a prepaid label, and a public trust trail.
 *  BookScouter is the comparator, not a buyer. Gift-card-only vendors are out.
 *
 *  The numeric fields below turn each desk into a quote model: thresholdUsd is the
 *  prepaid-label minimum (the constraint the packer solves against), payRate is the
 *  share of the demand prior the desk tends to pay at good condition, and the lane
 *  fits are the textbook/trade tilt. They are modelled from published minimums and
 *  category priors, not scraped from live quote pages — the UI labels them modelled. */
export const buyers: Buyer[] = [
  {
    id: "booksrun",
    name: "BooksRun",
    bestAt: "Textbooks and technical books. Quoted every title in a same-day 2026 comparison and won most of them.",
    prepaid: "Prepaid USPS label once the order clears $7.50",
    payment: "PayPal, bank transfer, or check",
    speed: "After they receive and check the books. PayPal is the fast path; checks take longer.",
    minimum: "$7.50",
    trust: "BookScouter trust check passed Nov 6, 2026. Trustpilot around 4.5 from buyers and sellers.",
    url: "https://booksrun.com/",
    thresholdUsd: 7.5,
    payRate: 0.55,
    textbookFit: 1.25,
    tradeFit: 0.8,
    floorUsd: 0.25,
    frictionUsd: 2.6,
  },
  {
    id: "worldofbooks",
    name: "World of Books",
    bestAt: "Trade nonfiction they are short on. Weak and erratic on textbooks.",
    prepaid: "Prepaid label, usually after a few books",
    payment: "PayPal or ACH",
    speed: "About 2–3 days after processing. Checks are slower.",
    minimum: "Often 2–3 books",
    trust: "Long-running buyer. Treat a very low quote next to a high BooksRun quote as a pass, not a market price.",
    url: "https://sell.worldofbooks.com/",
    thresholdUsd: 9,
    payRate: 0.32,
    textbookFit: 0.55,
    tradeFit: 1.2,
    floorUsd: 0.2,
    frictionUsd: 2.2,
  },
  {
    id: "topdollar",
    name: "TopDollar4Books",
    bestAt: "Small stacks that miss other minimums.",
    prepaid: "Prepaid label with no published order minimum",
    payment: "PayPal or check",
    speed: "Payment claimed within about 36 hours of drop-off, once they accept the books.",
    minimum: "None published",
    trust: "Useful second desk. Smaller catalog than BooksRun.",
    url: "https://www.topdollar4books.com/",
    thresholdUsd: 0,
    payRate: 0.24,
    textbookFit: 0.7,
    tradeFit: 1,
    floorUsd: 0.15,
    frictionUsd: 1.4,
  },
  {
    id: "valore",
    name: "Valore",
    bestAt: "Second opinion on current-edition textbooks.",
    prepaid: "Prepaid label on accepted buyback orders",
    payment: "After receipt, per their buyback terms",
    speed: "After the warehouse check",
    minimum: "Varies by cart",
    trust: "Established textbook buyer. Confirm the quote is cash, not credit.",
    url: "https://www.valore.com/",
    thresholdUsd: 10,
    payRate: 0.48,
    textbookFit: 1.35,
    tradeFit: 0.6,
    floorUsd: 0.3,
    frictionUsd: 3,
  },
  {
    id: "textbookrush",
    name: "TextbookRush",
    bestAt: "Course books, especially when BooksRun and Valore disagree.",
    prepaid: "Prepaid label on qualifying buyback orders",
    payment: "PayPal or check after acceptance",
    speed: "After receipt",
    minimum: "Varies",
    trust: "Long-running textbook desk. Skip if the quote is store credit.",
    url: "https://www.textbookrush.com/",
    thresholdUsd: 12,
    payRate: 0.42,
    textbookFit: 1.3,
    tradeFit: 0.6,
    floorUsd: 0.3,
    frictionUsd: 3,
  },
];

export const comparatorUrl = (isbn: string) => `https://bookscouter.com/book/${isbn}`;

export const buyerName = (id: string) => buyers.find((buyer) => buyer.id === id)?.name ?? id;

export const buyerById = (id: string) => buyers.find((buyer) => buyer.id === id);
