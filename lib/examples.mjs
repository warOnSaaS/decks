// The three example decks anyone can look at, and every new hosted account starts with.
// All fictional: Acme Dental, Birch Law and Relay, with made-up people and numbers.
// Bump a deck's version when its content changes, and servers make it again on start.
const U = (id) => `https://images.unsplash.com/${id}?w=1600&q=80&auto=format&fit=crop`;

const acme = {
  title: 'Acme Dental: investor update',
  description: 'A quarterly update for investors, with the numbers, the plan and the ask.',
  theme: { scheme: 'tide', mode: 'light', shape: 'round', type: 'humanist', surface: 'elevated', density: 'comfortable' },
  brand: { logo: '/app/examples/acme-dental.png', footer: 'Acme Dental · Investor update, Q3 2026' },
  slides: [
    { layout: 'title', kicker: 'Investor update · Q3 2026', title: 'Four clinics, one front desk that never misses a call', subtitle: 'Where we are, what changed this quarter, and what the next $2M does.', notes: 'Thank everyone for coming. Twenty minutes, then questions. The short version: best quarter yet, and we know why.' },
    { layout: 'big_number', kicker: 'The headline', title: '$4.2M', subtitle: 'Revenue run rate, up 38% on last year, from the same number of chairs.', notes: 'This is the number to remember. No new chairs, no new front desk staff. The growth came from filling the chairs we have.' },
    { layout: 'content', kicker: 'Quarter at a glance', title: 'Every number moved the right way', blocks: [
      { t: 'stats', items: [{ value: '1,240', label: 'New patients', note: '+22% on Q2' }, { value: '87%', label: 'Chair use', note: 'from 74% a year ago' }, { value: '2%', label: 'Calls missed', note: 'from 19%' }, { value: '71', label: 'Net promoter score', note: 'industry median is 58' }] },
      { t: 'callout', text: 'Missed calls were the biggest leak. Each one was a patient who booked somewhere else.', tone: 'info' },
    ], notes: 'Walk through each stat. Spend the most time on missed calls: that is the story of the quarter.' },
    { layout: 'two_column', kicker: 'Revenue', title: 'Revenue grew every single month', blocks: [
      { t: 'chart', slot: 'left', kind: 'area', labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'], series: [{ name: 'Monthly revenue', values: [262, 271, 280, 296, 305, 318, 331, 342, 350] }], unit: '$k' },
      { t: 'bullets', slot: 'right', items: ['Hygiene recall alone added $41k a month', 'Same-day crowns are now 14% of procedures', 'No new chairs, no new hires at the front desk'] },
    ], notes: 'The curve is steady, not a spike. Recall is the biggest driver and it compounds.' },
    { layout: 'image_right', kicker: 'What changed', title: 'The front desk answers every call, day and night', subtitle: 'An assistant that knows the schedule books, reschedules and reminds.', image: { url: U('photo-1629909613654-28e377c37b09'), alt: 'A bright, empty treatment room' }, blocks: [
      { t: 'chat', prompt: 'Who is overdue for a cleaning at Birchwood?', answer: '38 patients. I texted all of them a booking link; 11 have booked so far.', tools: [{ name: 'crm.find', arg: 'recall overdue, Birchwood', out: '38 found' }, { name: 'sms.send', arg: '38 reminders', out: 'sent' }] },
    ], notes: 'Show this as a real exchange from September. Staff review every text before it goes out.' },
    { layout: 'two_column', kicker: 'Growth', title: 'New patients come from people who already love us', blocks: [
      { t: 'chart', slot: 'left', kind: 'donut', labels: ['Referrals', 'Search', 'Insurance directory', 'Walk-ins'], series: [{ name: 'New patients', values: [42, 31, 17, 10] }], unit: '%' },
      { t: 'text', slot: 'right', size: 'lg', text: 'Referrals are **42%** of new patients. We now thank every referrer by name, and it shows.' },
    ], notes: 'Referrals cost us nothing. Search is second; we spend about $9 per new patient there.' },
    { layout: 'content', kicker: 'Clinics', title: 'Four clinics, side by side', blocks: [
      { t: 'table', head: ['Clinic', 'Opened', 'Chairs', 'Revenue Q3', 'Chair use'], rows: [['Birchwood', '2019', '6', '$412k', '91%'], ['Maple Street', '2021', '5', '$318k', '88%'], ['Riverside', '2023', '4', '$226k', '84%'], ['Hillcrest', '2025', '4', '$94k', '71%']] },
    ], notes: 'Hillcrest is eight months old and on the same curve Riverside was. Break-even next quarter.' },
    { layout: 'content', kicker: 'The plan', title: 'The next twelve months', blocks: [
      { t: 'timeline', items: [{ when: 'Q4 2026', title: 'Hillcrest breaks even', text: 'On track: 71% chair use and rising' }, { when: 'Q1 2027', title: 'Clinic five opens in Oakview', text: 'Lease signed, build-out starts in November' }, { when: 'Q2 2027', title: 'Orthodontics at two clinics', text: 'One orthodontist hired, one in talks' }, { when: 'Q3 2027', title: '$6M run rate', text: 'With five clinics and the same front desk' }] },
    ], notes: 'Each step pays for the next. Nothing here depends on the raise except clinics six and seven.' },
    { layout: 'section', kicker: 'The ask', title: '$2M to open three more clinics', subtitle: 'A playbook that works, a front desk that scales, and two sites already chosen.', notes: 'Pause here. Let the ask land before the breakdown.' },
    { layout: 'content', kicker: 'Use of funds', title: 'Where the $2M goes', blocks: [
      { t: 'chart', kind: 'bar', labels: ['Three new clinics', 'Equipment', 'Hiring and training', 'Working capital'], series: [{ name: 'Spend', values: [1100, 450, 300, 150] }], unit: '$k' },
    ], notes: 'Most of it is build-out. Equipment is leased where it makes sense.' },
    { layout: 'closing', kicker: 'Thank you', title: 'Questions, then a tour of Birchwood', subtitle: 'Sam Rivera, founder · sam@acme-dental.example', blocks: [{ t: 'button', text: 'Book a call with Sam', url: 'https://acme-dental.example/investors' }], notes: 'Offer the tour. People who see the front desk working are the ones who invest.' },
  ],
};

const birch = {
  title: 'Birch Law: client pitch',
  description: 'A pitch to a growing dental group, with fixed fees and a 90-day plan.',
  theme: { scheme: 'ember', mode: 'light', shape: 'soft', type: 'editorial', surface: 'flat', density: 'spacious' },
  brand: { logo: '/app/examples/birch-law.png', footer: 'Birch Law LLP · Prepared for Acme Dental' },
  slides: [
    { layout: 'title', kicker: 'Prepared for Acme Dental', title: 'Grow to seven clinics without seven times the legal risk', subtitle: 'Employment and regulatory counsel for healthcare practices, at a fixed monthly fee.', notes: 'Introduce Casey and Jordan. Say thank you for the time at Birchwood last week.' },
    { layout: 'quote', kicker: 'What we heard', title: 'We want to open three clinics next year, and I do not want to learn employment law the hard way.', subtitle: 'Sam Rivera, founder, Acme Dental', notes: 'Use Sam\'s own words. Everything that follows answers this.' },
    { layout: 'content', kicker: 'Your situation', title: 'Three things to get right before you grow', blocks: [
      { t: 'cards', items: [{ title: 'Hiring fast', text: 'Twelve new staff across three clinics, each needing a contract and onboarding that holds up.', tag: 'Spring' }, { title: 'Patient data', text: 'Privacy policies were written for one clinic. Four clinics share records now.', tag: 'Now' }, { title: 'New leases', text: 'Three leases to negotiate, with build-out terms that protect you.', tag: 'Winter' }] },
    ], notes: 'Ask if we missed anything. Usually there is a fourth item, often a partner agreement.' },
    { layout: 'image_left', kicker: 'Who we are', title: 'Nine lawyers who only work with practices', image: { url: U('photo-1505664194779-8beaceb93744'), alt: 'A library with old books and busts' }, blocks: [
      { t: 'kv', items: [{ label: 'Founded', value: '2011, in Oakview' }, { label: 'Lawyers', value: '9, all healthcare' }, { label: 'Practices served', value: '140 and counting' }, { label: 'Average reply', value: 'Under two hours' }] },
    ], notes: 'Keep it short. They care about what we do for them, not about us.' },
    { layout: 'content', kicker: 'The first 90 days', title: 'Listen, audit, fix, train', blocks: [
      { t: 'steps', items: [{ title: 'Listen', text: 'A half-day at Birchwood with your clinic managers' }, { title: 'Audit', text: 'Contracts, handbook and data policies, read line by line' }, { title: 'Fix', text: 'Rewrite what is risky, in words your staff understand' }, { title: 'Train', text: 'One hour with every clinic manager, recorded' }] },
    ], notes: 'Each step has a named owner on our side. Jordan leads the audit.' },
    { layout: 'two_column', kicker: 'Fees', title: 'One fixed fee, and no surprise bills', blocks: [
      { t: 'table', slot: 'left', head: ['Work', 'Hourly firms', 'Birch Law'], rows: [['Employee handbook', '$8k to $14k', 'Included'], ['Privacy policy set', '$6k to $10k', 'Included'], ['Hiring contracts', '$350 each', 'Included'], ['Questions by phone', 'By the hour', 'Included']] },
      { t: 'stats', slot: 'right', items: [{ value: '$4,500', label: 'A month, everything above', note: 'Leases at a fixed price each' }] },
      { t: 'callout', slot: 'right', text: 'Cancel with 30 days notice. You keep every document we write.', tone: 'good' },
    ], notes: 'Compare against what they paid last year: about $61k in hourly bills.' },
    { layout: 'two_column', kicker: 'Where you stand', title: 'Your legal health today, from our first look', blocks: [
      { t: 'score', slot: 'left', grade: 58, title: 'Acme Dental, October 2026', areas: [{ label: 'Hiring', value: 52 }, { label: 'Patient data', value: 48 }, { label: 'Leases', value: 71 }, { label: 'Workplace policies', value: 62 }] },
      { t: 'text', slot: 'right', size: 'lg', text: 'Nothing here is an emergency. **Patient data** is the one to fix first, before the fifth clinic shares records.' },
    ], notes: 'Be calm about the score. It is typical for a group that grew fast.' },
    { layout: 'content', kicker: 'Timeline', title: 'Ready before your next clinic opens', blocks: [
      { t: 'timeline', items: [{ when: 'Week 1', title: 'Kickoff at Birchwood', text: 'Half a day with your managers' }, { when: 'Week 3', title: 'Audit report', text: 'What is risky, ranked, in plain words' }, { when: 'Week 6', title: 'New handbook signed', text: 'Rolled out to all four clinics' }, { when: 'Week 10', title: 'First lease done', text: 'Oakview, with build-out protection' }] },
    ], notes: 'Oakview lease is the hard deadline. Everything else fits around it.' },
    { layout: 'big_number', kicker: 'Clients', title: '140+', subtitle: 'practices trust Birch Law. Ask any of them about us.', blocks: [{ t: 'quote', text: 'They answered within an hour, every time. That alone was worth it.', by: 'Jordan Lee, practice manager, Maple Street Dental' }], notes: 'Offer three references. Riley at Pine Dental is the best one to call.' },
    { layout: 'closing', kicker: 'Next step', title: 'Let us start with a half-day at Birchwood', subtitle: 'Casey Morgan, partner · casey@birch-law.example', blocks: [{ t: 'button', text: 'Pick a date', url: 'https://birch-law.example/start' }], notes: 'Ask for the date in the room.' },
  ],
};

const relay = {
  title: 'Relay: product launch',
  description: 'The launch plan for Relay 2.0, a team inbox that drafts replies.',
  theme: { scheme: 'midnight', mode: 'dark', shape: 'round', type: 'grotesk', surface: 'elevated', density: 'comfortable' },
  brand: { logo: '/app/examples/relay.png', footer: 'Relay 2.0 · Launch plan' },
  slides: [
    { layout: 'title', kicker: 'Launch plan · November 2026', title: 'Relay 2.0', subtitle: 'The team inbox that drafts the answer before you open the message.', notes: 'Fifteen minutes. The goal of this meeting: everyone leaves knowing their part of launch week.' },
    { layout: 'section', kicker: 'Part one', title: 'Why now', subtitle: 'Small teams answer the same questions all day.', bg: 'inverse', notes: 'Quick section. Most of the room knows this already.' },
    { layout: 'content', kicker: 'The problem', title: 'Teams drown in questions they have answered before', blocks: [
      { t: 'stats', items: [{ value: '61%', label: 'Of messages repeat last month\'s', note: 'Across 40 beta teams' }, { value: '3.4h', label: 'A day per person in the inbox' }, { value: '18 min', label: 'Median first reply', note: 'Customers expect under 5' }] },
    ], notes: 'These are from our beta data, not a survey.' },
    { layout: 'image_right', kicker: 'What ships', title: 'Everything in one inbox, with the reply already drafted', image: { url: U('photo-1460925895917-afdab827c52f'), alt: 'A laptop showing a dashboard' }, blocks: [
      { t: 'bullets', items: ['Drafts written from your own past answers', 'Email, chat and web forms in one list', 'Your own AI, connected over MCP: no AI bill from us', 'Works on phones, offline first'] },
    ], notes: 'Lead with drafts. The MCP point matters most for technical buyers.' },
    { layout: 'two_column', kicker: 'Beta results', title: 'Beta teams answered more than twice as fast', blocks: [
      { t: 'chart', slot: 'left', kind: 'column', labels: ['Acme Dental', 'Birch Law', 'Pine Studio', 'Oak Clinic'], series: [{ name: 'Before', values: [22, 31, 18, 27] }, { name: 'With Relay', values: [9, 12, 8, 11] }], unit: ' min', title: 'Median first reply' },
      { t: 'quote', slot: 'right', text: 'I open the inbox and half of it is done. I just check and send.', by: 'Riley Chen, office lead, Oak Clinic' },
    ], notes: 'Every beta team improved. Birch Law had the most complex questions and still went from 31 to 12.' },
    { layout: 'content', kicker: 'How it feels', title: 'Ask it in words, check it, send it', blocks: [
      { t: 'chat', prompt: 'Draft a reply to Jordan about moving her Friday appointment.', answer: 'Done. I offered Thursday at 3pm or Monday at 9am, the two open times with Dr. Lee. It is in your drafts.', tools: [{ name: 'calendar.find_slots', arg: 'Dr. Lee, next 5 days', out: '2 open' }, { name: 'inbox.save_draft', arg: 'reply to Jordan', out: 'saved' }] },
    ], notes: 'This is the demo moment in the launch video.' },
    { layout: 'content', kicker: 'Pricing', title: 'Free to host yourself, simple if we host it', blocks: [
      { t: 'cards', items: [{ title: 'Self-host', text: 'Every feature, forever. One command to run it.', tag: 'Free' }, { title: 'Team', text: 'We host it. Per person, per month, billed monthly.', tag: '$9' }, { title: 'Business', text: 'Single sign-on, audit log and a support line.', tag: '$19' }] },
    ], notes: 'Price is cost times two, shown openly on the site.' },
    { layout: 'content', kicker: 'Launch week', title: 'Four dates that matter', blocks: [
      { t: 'timeline', items: [{ when: 'Nov 3', title: 'Waitlist gets access', text: '2,400 teams, in batches of 300' }, { when: 'Nov 10', title: 'Public launch', text: 'Blog post, video, and the launch site' }, { when: 'Nov 17', title: 'Live session with beta teams', text: 'Oak Clinic and Birch Law have said yes' }, { when: 'Dec 1', title: 'Business plan opens', text: 'Single sign-on ready' }] },
    ], notes: 'Owners: Casey for the waitlist, Jordan for launch day, Sam for the session.' },
    { layout: 'two_column', kicker: 'Readiness', title: 'Where we are today', blocks: [
      { t: 'checklist', slot: 'left', items: [{ text: 'Drafts on by default', done: true }, { text: 'Phone app in the stores', done: true }, { text: 'Help center rewritten', done: true }, { text: 'Launch video edited', done: false }] },
      { t: 'checklist', slot: 'right', items: [{ text: 'Pricing page live', done: true }, { text: 'Migration from 1.x tested', done: true }, { text: 'Single sign-on', done: false }, { text: 'Press list sent', done: false }] },
    ], notes: 'Four open items, all with owners and dates. Nothing blocks November 3.' },
    { layout: 'big_number', kicker: 'The goal', title: '600', subtitle: 'Paying teams by the end of January, from 2,400 on the waitlist.', notes: 'A 25% conversion. Beta teams converted at 41%, so this is cautious.' },
    { layout: 'closing', kicker: 'Questions', title: 'Ship it', subtitle: 'Jordan Lee, launch lead · jordan@relay.example', notes: 'Open the floor. Then everyone to their owner checklist.' },
  ],
};

export const EXAMPLES = [
  { key: 'acme', version: 1, deck: acme },
  { key: 'birch', version: 1, deck: birch },
  { key: 'relay', version: 1, deck: relay },
];
