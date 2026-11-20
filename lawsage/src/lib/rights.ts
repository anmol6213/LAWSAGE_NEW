import { Gavel, FileText, ShoppingBag, ShieldAlert, FileSearch, ShieldCheck } from 'lucide-react';

export type Guide = {
  id: string;
  title: string;
  icon: typeof Gavel;
  summary: string;
  law: string;
  steps: { title: string; text: string }[];
  remember: string[];
  helplines: { label: string; value: string }[];
  prompt: string;
};

export const guides: Guide[] = [
  {
    id: 'arrest',
    title: 'If you are arrested',
    icon: Gavel,
    summary: 'What police must tell you, who you can call, and the 24-hour rule.',
    law: 'Article 22 and Article 20(3) of the Constitution; BNSS, 2023 (earlier CrPC); D.K. Basu v. State of West Bengal (1997).',
    steps: [
      { title: 'Ask the reason', text: 'Police must tell you the grounds of arrest. If the offence is bailable, they must also tell you that you can seek bail. (Article 22(1))' },
      { title: 'Ask for a lawyer', text: 'You have the right to consult a lawyer of your choice. If you cannot afford one, you can get free legal aid from the District Legal Services Authority.' },
      { title: 'Have someone informed', text: 'Police must inform a relative or friend of your choice about the arrest and where you are held.' },
      { title: 'Read before you sign', text: 'An arrest memo should be prepared and signed by you and a witness. Do not sign blank or unread papers.' },
      { title: 'Count the hours', text: 'You must be produced before a Magistrate within 24 hours of arrest, not counting travel time. (Article 22(2))' },
      { title: 'Tell the Magistrate about any ill-treatment', text: 'If you were hurt or pressured, say so in court and ask for a medical examination.' },
    ],
    remember: [
      'You cannot be forced to confess or to give evidence against yourself. (Article 20(3))',
      'Women are generally not arrested after sunset and before sunrise, except in exceptional cases with a Magistrate’s written permission.',
    ],
    helplines: [
      { label: 'Emergency', value: '112' },
      { label: 'Free legal aid (NALSA)', value: '15100' },
    ],
    prompt: 'What are my rights if I am arrested in India?',
  },
  {
    id: 'fir',
    title: 'File an FIR',
    icon: FileText,
    summary: 'How to report a crime, get a free copy, and what to do if police refuse.',
    law: 'BNSS, 2023, Section 173 (earlier CrPC Section 154); Lalita Kumari v. Government of U.P. (2013).',
    steps: [
      { title: 'Go to any police station', text: 'For a cognizable offence, police must register your report even if the crime happened in another area. This is called a Zero FIR and is transferred later.' },
      { title: 'Give clear details', text: 'Say what happened, when, where and who was involved. The officer writes it down and reads it back to you.' },
      { title: 'Check, then sign', text: 'Make sure everything is correct before you sign. You can also report online through your state police portal, and sign within three days.' },
      { title: 'Take your free copy', text: 'You are entitled to a free copy of the FIR. Note the FIR number and date.' },
      { title: 'If police refuse', text: 'Send your complaint in writing, by post, to the Superintendent of Police.' },
      { title: 'Still no action', text: 'You can approach the Magistrate, who can direct police to register the FIR and investigate.' },
    ],
    remember: [
      'Keep a copy of every complaint you submit, with the date.',
      'For non-cognizable offences police may need the Magistrate’s permission to investigate.',
    ],
    helplines: [
      { label: 'Emergency', value: '112' },
      { label: 'Women helpline', value: '181' },
    ],
    prompt: 'How do I file an FIR, and what if the police refuse?',
  },
  {
    id: 'consumer',
    title: 'Consumer complaint',
    icon: ShoppingBag,
    summary: 'From a faulty product to a refused refund: where to complain and in what order.',
    law: 'Consumer Protection Act, 2019 and the Consumer Protection (Jurisdiction) Rules, 2021.',
    steps: [
      { title: 'Collect your proof', text: 'Bill or invoice, payment receipt, warranty card, screenshots, emails and messages.' },
      { title: 'Complain to the seller in writing', text: 'State the problem, what you want (repair, replacement, refund) and a deadline, such as 15 days. Keep a copy.' },
      { title: 'Call the National Consumer Helpline', text: 'The helpline often gets companies to resolve issues without going to court.' },
      { title: 'File with the Consumer Commission', text: 'District Commission for claims up to ₹50 lakh, State Commission from ₹50 lakh to ₹2 crore, National Commission above ₹2 crore. File online on the e-Jagriti portal or in person.' },
      { title: 'Attend the hearings', text: 'You can argue your own case. No court fee is charged for claims up to ₹5 lakh.' },
    ],
    remember: [
      'File within 2 years from the date the problem arose.',
      'Limits and fees can change, so check the official portal before you file.',
    ],
    helplines: [{ label: 'National Consumer Helpline', value: '1915' }],
    prompt: 'How do I file a consumer complaint in India?',
  },
  {
    id: 'cyber',
    title: 'Online fraud or scam',
    icon: ShieldAlert,
    summary: 'The first hour matters. Report quickly to give the bank a chance to hold your money.',
    law: 'Information Technology Act, 2000 and the Bharatiya Nyaya Sanhita, 2023 (cheating).',
    steps: [
      { title: 'Call 1930 right away', text: 'This is the national cyber fraud helpline. Early reports improve the chance of freezing the money.' },
      { title: 'Tell your bank', text: 'Ask them to block the card or account, and raise a dispute for the transaction.' },
      { title: 'Report online', text: 'File a complaint on cybercrime.gov.in with all details.' },
      { title: 'Save the evidence', text: 'Screenshots, transaction IDs, phone numbers, links and chat messages. Do not delete anything.' },
      { title: 'Secure your accounts', text: 'Change passwords, and never share OTPs, PINs or screen-share access with anyone.' },
    ],
    remember: ['Banks and the police never ask for your OTP or PIN.'],
    helplines: [
      { label: 'Cyber fraud', value: '1930' },
      { label: 'Emergency', value: '112' },
    ],
    prompt: 'I lost money in an online fraud. What should I do in India?',
  },
  {
    id: 'rti',
    title: 'Use the Right to Information',
    icon: FileSearch,
    summary: 'Ask any government office for records, decisions or spending.',
    law: 'Right to Information Act, 2005.',
    steps: [
      { title: 'Find the office', text: 'Identify the public authority that holds the information, and its Public Information Officer (PIO).' },
      { title: 'Write your application', text: 'Describe the information you want clearly and specifically. The fee is ₹10 for central government bodies; states may differ. Below-poverty-line applicants are exempt.' },
      { title: 'Submit it', text: 'By post, in person, or online. Central ministries use the RTI Online portal.' },
      { title: 'Wait for the reply', text: 'The PIO must reply within 30 days, or within 48 hours if the matter concerns life or liberty.' },
      { title: 'Appeal if needed', text: 'File a first appeal within 30 days. After that you can go to the Information Commission within 90 days.' },
    ],
    remember: ['Some information is exempt, such as matters of national security. The PIO must give the reason for refusal.'],
    helplines: [],
    prompt: 'How do I file an RTI application in India?',
  },
  {
    id: 'domestic',
    title: 'Domestic violence help',
    icon: ShieldCheck,
    summary: 'Protection, shelter and legal remedies for women facing abuse at home.',
    law: 'Protection of Women from Domestic Violence Act, 2005; BNS, 2023, Section 85 (earlier IPC 498A).',
    steps: [
      { title: 'If you are in danger, call for help', text: 'Call 112 or the Women Helpline 181, and move to a safe place if you can.' },
      { title: 'Contact a Protection Officer', text: 'Every district has one. You can also approach a recognised NGO or directly apply to a Magistrate.' },
      { title: 'Ask for the orders you need', text: 'A Magistrate can order protection from abuse, your right to stay in the shared home, maintenance and compensation.' },
      { title: 'Consider an FIR', text: 'Cruelty by a husband or his relatives is a criminal offence. You can file an FIR alongside a civil complaint.' },
      { title: 'Get free legal help', text: 'Women are entitled to free legal aid through the District Legal Services Authority.' },
    ],
    remember: ['You do not need to leave your shared home to seek protection. You have a right to reside there.'],
    helplines: [
      { label: 'Emergency', value: '112' },
      { label: 'Women helpline', value: '181' },
      { label: 'Free legal aid (NALSA)', value: '15100' },
    ],
    prompt: 'What legal protection does a woman have against domestic violence in India?',
  },
];
