// Shared by the Worker and browser fallback so common answers stay consistent.
export function customerReply(normalized) {
  const kid = /\b(kid|kids|child|children|youth|year old)\b/.test(normalized);
  const beginner = /\b(beginner|beginners|new|never trained|first time|shy|nervous)\b/.test(normalized);
  const prices = /\b(price|pricing|cost|membership|trial|fee|fees|discount|rates|how much|free)\b/.test(normalized);
  const visitDetails = /\b(what.*wear|what.*bring|equipment|gear|waiver|parking|age requirement|how old|minimum age)\b/.test(normalized);
  const join = /\b(book|booking|reserve|reservation|appointment|register|registration|enroll|enrollment|join|sign up|signup|first class|try a class|try class|interested)\b/.test(normalized);
  const identity = /\b(deepseek|chatgpt|language model|who are you|what are you|are you (an |a )?(ai|bot|human))\b/.test(normalized);
  if (identity) {
    const provider = /\b(deepseek|chatgpt|language model)\b/.test(normalized) ? ' Some answers use DeepSeek.' : '';
    return { answer: `I’m BUMA’s AI receptionist. I can help with classes, schedules and planning a visit. The academy team handles requests and confirms bookings.${provider}`, sourceIds: [], actions: ['leadForm'] };
  }
  if (/^(hi|hello|hey|good morning|good afternoon|good evening)( there)?$/.test(normalized)) {
    return { answer: 'Hi! Welcome to Buffalo United. Are you looking for classes for yourself or for a child?', sourceIds: [], actions: ['schedule', 'leadForm'] };
  }
  if (/^(thanks|thank you|thank you very much|bye|goodbye)$/.test(normalized)) {
    return { answer: 'You’re welcome! Feel free to ask if anything else comes up.', sourceIds: [], actions: [] };
  }
  if (/^(how are you|how s it going|hows it going|how are things)$/.test(normalized)) {
    return { answer: 'Thanks for asking! I’m here and ready to help. What would you like to know about BUMA?', sourceIds: [], actions: [] };
  }
  if (/^(show|view|see)? ?(the )?(class )?schedule$/.test(normalized)) {
    return { answer: 'Tap “View class schedule” to see class times. Please confirm with BUMA before your first visit, as times can change.', sourceIds: ['morning', 'kids', 'weekend'], actions: ['schedule', 'call'] };
  }
  if (!(beginner || prices || visitDetails || join)) return null;
  const parts = [];
  const sourceIds = [];
  if (beginner) {
    if (kid) {
      parts.push('BUMA’s kids classes focus on confidence, teamwork and safe fundamentals. The team can help you decide whether a class fits your child’s age and comfort level.');
      sourceIds.push('kids');
    } else {
      parts.push('Beginners are welcome at BUMA. There are fundamentals and all-level classes, and the team can help you choose where to start.');
      sourceIds.push('overview', 'bjj');
    }
  }
  if (prices) {
    parts.push('I don’t have current prices or confirmed trial offers, so I don’t want to guess. BUMA can confirm those for you.');
    sourceIds.push('pricing');
  }
  if (visitDetails) {
    const detail = /\b(wear|bring|equipment|gear)\b/.test(normalized) ? 'what to wear or bring' : /\bparking\b/.test(normalized) ? 'parking arrangements' : /\b(age|how old)\b/.test(normalized) ? 'age requirements' : 'the waiver requirements';
    parts.push(`I don’t have confirmed details on ${detail} yet. Please check with the team before your visit.`);
  }
  parts.push(join ? 'Tap “Request first class” to send the team your interest. They’ll need to confirm availability; the form doesn’t book a place.' : 'You can use “Request first class” to ask the team, or give them a call.');
  return { answer: parts.join(' '), sourceIds, actions: ['leadForm', 'call'] };
}
