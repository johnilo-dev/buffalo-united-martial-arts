// Shared by the Worker and browser fallback so common answers stay consistent.
export function followupQuery(message, history = []) {
  if (!/^(what about|how about|and |what time|when)/i.test(message.trim()) || message.length > 65) return message;
  const previous = history.filter(item => item.role === 'user').at(-1)?.content || '';
  const topics = previous.toLowerCase().match(/kids|child|children|boxing|muay thai|bjj|jiu.jitsu|judo|sambo|no.gi/g) || [];
  return `${[...new Set(topics)].join(' ')} ${message}`.trim();
}

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
  if (/^(for me|myself|for myself)$/.test(normalized)) return {answer: 'What interests you most: grappling, striking, or general fitness?', sourceIds: [], actions: ['schedule']};
  if (/^(for my child|for my kid|my child|my kid)$/.test(normalized)) return {answer: 'BUMA offers kids BJJ and kids Muay Thai. Would you like to see the class times?', sourceIds: ['kids'], actions: ['schedule', 'leadForm']};
  const schedule = /\b(when|schedule|what time|saturday|sunday|weekend)\b/.test(normalized);
  const knownSchedule = schedule && (prices || beginner || visitDetails || join || /\b(what about|how about)\b/.test(normalized)) && (kid || /\b(boxing|saturday|sunday|weekend)\b/.test(normalized));
  if (!(beginner || prices || visitDetails || join || knownSchedule)) return null;
  const parts = [];
  const sourceIds = [];
  if (knownSchedule) {
    if (kid) {
      parts.push('Kids BJJ is Monday and Wednesday at 5:30 PM; kids Muay Thai is Tuesday and Thursday at 5:30 PM. The Saturday kids BJJ family class is at 10 AM.');
      sourceIds.push('kids');
    } else if (/\bboxing\b/.test(normalized)) {
      parts.push(/\b(saturday|monday|tuesday|wednesday|thursday|friday)\b/.test(normalized) ? 'I only have boxing listed for Sunday at 12 PM, not that day.' : 'Boxing is listed for Sunday at 12 PM.');
      sourceIds.push('weekend');
    } else {
      if (!/\bsunday\b/.test(normalized)) parts.push('Saturday published classes: Muay Thai at 9 AM, fundamentals and kids BJJ family classes at 10 AM, and all-level gi BJJ at 11 AM.');
      if (!/\bsaturday\b/.test(normalized)) parts.push('Sunday: competition class at 8 AM and boxing at 12 PM.');
      sourceIds.push('weekend');
    }
    parts.push('Please confirm times before your first visit.');
  }
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
  if (beginner || prices || visitDetails || join) parts.push(join ? 'Tap “Request first class” to send the team your interest. They’ll need to confirm availability; the form doesn’t book a place.' : 'You can use “Request first class” to ask the team, or give them a call.');
  return { answer: parts.join(' '), sourceIds: [...new Set(sourceIds)], actions: knownSchedule && !(prices || join) ? ['schedule', 'call'] : ['leadForm', 'call'] };
}
