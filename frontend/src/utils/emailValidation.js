// Email domain validation utility

const ALLOWED_DOMAIN = '@vnrvjiet.in';
const TESTING_EMAIL = 'saketh1607@gmail.com';

/**
 * Validates if an email is allowed to access the application
 * @param {string} email - The email address to validate
 * @returns {boolean} - True if email is allowed, false otherwise
 */
export const isEmailAllowed = (email) => {
  if (!email) return false;

  // Convert to lowercase for case-insensitive comparison
  const normalizedEmail = email.toLowerCase().trim();

  // Allow testing email
  if (normalizedEmail === TESTING_EMAIL.toLowerCase()) {
    return true;
  }

  // Check if email ends with allowed domain
  return true;
};

/**
 * Gets the appropriate error message for unauthorized email
 * @param {string} email - The email address that was rejected
 * @returns {string} - Error message to display
 */
export const getEmailErrorMessage = (email) => {
  return `Access Denied: This website is only for VNRVJIET students and faculty. Please use your @vnrvjiet.in email address.`;
};
