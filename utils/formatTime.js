/**
 * Format timestamp to readable time
 */
export const formatTime = (timestamp) => {
  if (!timestamp) return '';
  
  // If timestamp is already a formatted string (like "Mar 08, 9:47 PM"), return it as-is
  if (typeof timestamp === 'string' && isNaN(Date.parse(timestamp)) && !timestamp.match(/^\d+$/)) {
    // Check if it looks like a formatted date string (contains month name or common date patterns)
    if (timestamp.match(/[A-Za-z]{3}\s+\d{1,2}/) || timestamp.includes('PM') || timestamp.includes('AM')) {
      return timestamp;
    }
  }
  
  try {
    const date = new Date(timestamp);
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      // If invalid date, return the original timestamp if it's a string
      return typeof timestamp === 'string' ? timestamp : '';
    }
    
    const now = new Date();
    const diff = now - date;
    
    // Less than 1 minute
    if (diff < 60000) {
      return 'Just now';
    }
    
    // Less than 1 hour
    if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000);
      return `${minutes}m ago`;
    }
    
    // Less than 24 hours
    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return `${hours}h ago`;
    }
    
    // Less than 7 days
    if (diff < 604800000) {
      const days = Math.floor(diff / 86400000);
      return `${days}d ago`;
    }
    
    // Format as date
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  } catch (error) {
    return timestamp;
  }
};

export const formatFullTime = (timestamp) => {
  if (!timestamp) return '';
  
  // If timestamp is already a formatted string, return it as-is
  if (typeof timestamp === 'string' && isNaN(Date.parse(timestamp)) && !timestamp.match(/^\d+$/)) {
    // Check if it looks like a formatted date string
    if (timestamp.match(/[A-Za-z]{3}\s+\d{1,2}/) || timestamp.includes('PM') || timestamp.includes('AM')) {
      return timestamp;
    }
  }
  
  try {
    const date = new Date(timestamp);
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      // If invalid date, return the original timestamp if it's a string
      return typeof timestamp === 'string' ? timestamp : '';
    }
    
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch (error) {
    return timestamp;
  }
};
