export const errorText = error => error.response?.data?.message || 'Could not complete this request. Please try again.';
export const date = value => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
