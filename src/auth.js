import { SignJWT, importPKCS8 } from 'jose';

/**
 * Generate a JWT token for Revolut API authentication
 * 
 * @param {Object} env - Environment variables
 * @returns {string} - JWT token
 */
export async function generateJwt(env) {
  const privateKeyPem = env.REVOLUT_PRIVATE_KEY;
  const clientId = env.REVOLUT_CLIENT_ID;
  const issuer = env.REVOLUT_ISSUER; // Domain name used as issuer
  
  // Get current time in seconds
  const now = Math.floor(Date.now() / 1000);
  
  try {
    // Import the private key
    const privateKey = await importPKCS8(privateKeyPem, 'RS256');
    
    // Create and sign JWT
    const jwt = await new SignJWT({
      'aud': 'https://revolut.com', // Audience
      'sub': clientId,  // Subject (client ID)
      'iss': issuer     // Issuer 
    })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuedAt(now)
      .setExpirationTime(now + 300) // Expires in 5 minutes (short-lived token)
      .sign(privateKey);
    
    return jwt;
  } catch (error) {
    console.error('Error generating JWT:', error);
    throw error;
  }
}