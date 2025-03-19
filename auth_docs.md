2. Generate a client assertion​

In order to grant the consent to your application, you will need to generate a client-assertion JWT (JSON Web Token) which is cryptographically signed with your private certificate generated in step 1.

This JWT will be used whenever a new access token needs to be requested, and it is composed of a header, a payload and a signature.

See examples for the header and the payload, and the format of the parameters
There are several libraries to generate a JWT. To manually generate the JWT from your CLI, perform the following steps:

Go back to your CLI.

Make sure that you are in the same directory where you saved your privatecert.pem file from step 1. If you want to use a different directory, make sure that you copy the private certificate there.

Prepare the JWT header and save it as header.json.

Save with a CLI command
Save manually
Paste this command into your CLI and press Enter.
cat <<EOF > header.json
{
  "alg": "RS256",
  "typ": "JWT"
}
EOF

Prepare the JWT payload and save it as payload.json. Replace the placeholders in angle brackets (<>) with your own values. Also, make sure that the exp value is a number, not a string.

Save with a CLI command
Save manually
Insert your values below to generate the payload. Then, copy and paste the below command into your CLI and press Enter.


iss

sub

exp
cat <<EOF > payload.json
{
  "iss": "curiousgeorge.dev",
  "sub": "mDLqzBK_6HGq2vLxA3VMcYOQwYitMIapFuOFWta6SLo",
  "aud": "https://revolut.com",
  "exp": 1750158342
} 
EOF

Generate the signed JWT and save it as client_assertion.txt.

Run this set of commands in your CLI. Remember to press Enter after pasting, otherwise it might not run fully, resulting in the signature missing.

# Add encoded and normalised header
cat header.json | tr -d '\n' | tr -d '\r' | openssl enc -base64 -A | tr +/ -_ | tr -d '=' > client_assertion.txt
echo -n "." >> client_assertion.txt
# Add encoded and normalised payload
cat payload.json | tr -d '\n' | tr -d '\r' | openssl enc -base64 -A | tr +/ -_ | tr -d '=' >> client_assertion.txt
# Generate signature
cat client_assertion.txt | tr -d '\n' | tr -d '\r' | openssl dgst -sha256 -sign privatecert.pem | openssl enc -base64 -A | tr +/ -_ | tr -d '=' > sign.txt
echo -n "." >> client_assertion.txt
# Add signature
cat sign.txt >> client_assertion.txt

Expected Result
A client_assertion.txt file containing the client assertion JWT is created in your chosen directory.

To display the contents of your JWT in the CLI, run:

cat client_assertion.txt


Validate your JWT

Tip
Below you can validate the JWT that you just generated.

Copy the contents of the client_assertion.txt file into the JWT String field and the contents of the publiccert.cer file into Public Key. Click on Test to check if the JWT is well-formed and if the signature matches against your public key.

JWT String

Public Key

Test
Result
Validation passed.
Header
{
  "alg": "RS256",
  "typ": "JWT"
}
Payload
{
  "iss": "curiousgeorge.dev",
  "sub": "mDLqzBK_6HGq2vLxA3VMcYOQwYitMIapFuOFWta6SLo",
  "aud": "https://revolut.com",
  "exp": 1750158342
}

Danger
Never share your client-assertion JWT (JSON web token) and refresh_token with anyone, as these can be used to access your banking data and initiate transactions.
3. Consent to the application​

Go back to the API settings.

Production
Sandbox
Log back in to the Revolut Business web app, and go to the Business API settings again.

Select the certificate you want to edit.

In the API Certificate details, copy your client ID from the ClientID field.

Click Enable access. This takes you to the /app-confirm endpoint where you grant your application access to your account via the Business API. See an example below.

https://business.revolut.com/app-confirm?client_id=<ClientID>&redirect_uri=https://example.com&response_type=code

Optionally
You can narrow down the security permissions of the consent by adding to this URL the scope query parameter with a comma separated list of the desired scopes as its value.
For example: (...)&response_type=code&scope=READ,WRITE.
Click Authorise. This triggers a 2-factor authentication (2FA) process.

Account access request

On successful authorisation, you are redirected to the OAuth redirect URI that you specified.

Get the authorization code (code) from the redirect URI.

https://example.com?code=oa_prod_vYo3mAI9TmJuo2_ukYlHVZMh3OiszmfQdgVqk_gLSkU
Caution
For security reasons, the authorization code is only valid for two minutes.

If it expires before you use it, you must repeat the substeps 4-6 of Consent to the application to generate a new one.
4. Exchange authorization code for access token​

To exchange the authorization code (code) for an access token (access_token), make the following cURL call, for example, from your CLI:

Production
Sandbox
curl https://b2b.revolut.com/api/1.0/auth/token \
  -H "Content-Type: application/x-www-form-urlencoded"\
  --data "grant_type=authorization_code"\
  --data "code=<INSERT_AUTHORIZATION_CODE>"\
  --data "client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer"\
  --data "client_assertion=<INSERT_JWT>"

Request fields (URL-encoded) - details
Expected Result
A successful response returns the access token with its type and expiry time in seconds, and the refresh token, which does not expire.

{
  "access_token": "oa_prod_rPo9OmbMAuguhQffR6RLR4nvmzpx4NJtpdyvGKkrS3U",
  "token_type": "bearer",
  "expires_in": 2399,
  "refresh_token": "oa_prod_hQacSGnwx-luIfj3dlVByrytVV9rWAnyHkpJTwG_Tr8"
}

Note
Every access token is only valid for 40 minutes. After the access token expires, you must request a new one, using the refresh token (refresh_token) and the JWT (client_assertion.txt).

For more information, see the Troubleshooting section: Access token expired.
5. Try your first API request​

To verify that everything is working, make a request to the /accounts endpoint to get a list of all your accounts using the access token which you obtained in the previous step:

Production
Sandbox
curl https://b2b.revolut.com/api/1.0/accounts \
  -H "Authorization: Bearer <your access_token>"

On success, you get a response similar to this one:

[
  {
    "id": "2a0d4d03-e26c-4159-9de1-c6bf3adfd8a1",
    "name": "Current GBP account",
    "balance": 100.0,
    "currency": "GBP",
    "state": "active",
    "public": false,
    "updated_at": "2017-06-01T11:11:11.1Z",
    "created_at": "2017-06-01T11:11:11.1Z"
  },
  {
    "id": "df8d6b20-0725-482e-a29e-fb09631480cf",
    "name": "EUR expenses account",
    "balance": 1234.0,
    "currency": "EUR",
    "state": "active",
    "public": false,
    "created_at": "2017-06-01T11:11:11.1Z",
    "updated_at": "2017-06-01T11:11:11.1Z"
  }
]

Success
Congratulations! You're ready to make requests to the Business API with an access token.
Troubleshooting​

Access token expired​

When the access token expires, you won't be able to make successful API calls and will get the 401 Unauthorized error in response:

{"message":"The request should be authorized."}

To regain access, you must first request a new access token using the refresh token (returned in step 4) and the JWT (obtained in step 2).

Get a new access token​

To request a new access token, make the following request.

Caution
Refreshing an access token invalidates the previous token.

This means that if you have an access token that hasn't expired yet and you refresh it with your refresh token, your existing access token will no longer work, and you will need to switch to the new access token.
Production
Sandbox
curl https://b2b.revolut.com/api/1.0/auth/token \
  -H "Content-Type: application/x-www-form-urlencoded"\
  --data "grant_type=refresh_token"\
  --data "refresh_token=<insert refresh_token>"\
  --data "client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer"\
  --data "client_assertion=<insert JWT>"

Request fields (URL-encoded) - details
A successful response returns a new access token with its type and expiry time in seconds.

{
  "access_token": "oa_prod_rPo9OmbMAuguhQffR6RLR4nvmzpx4NJtpdyvGKkrS3U",
  "token_type": "bearer",
  "expires_in": 2399
}

Refresh token expired​

While the refresh token has no expiration date, for businesses on the Freelancer plan, the refresh token is terminated every 90 days to ensure compliance to PSD2 SCA regulations. If that's your case, you must re-authorise the API to regain access to your account, and request a new access token.

Re-authorise the API​

To re-authorise the API, go to the Revolut Business app and connect your application again.

Open the Revolut Business web app.
Go to settings.
Go to APIs -> Business API.
Select your certificate.
Click or tap Enable access and continue from substep 5 of 3. Consent to the application.
Client assertion JWT expired​

Similarly to the access token, when you create a JWT in step 2, it also has an expiration date specified in the exp field.

If you refresh the access token with an expired JWT, you will get an error response like this:

{
    "error": "invalid_request",
    "error_description": "The Token has expired on Mon Jun 03 15:55:21 UTC 2024."
}

In this case, you must generate a new JWT by following the instructions in step 2. Make sure to use the same private key as before.

Best Practices
For security reasons, it is recommended that you provide a short expiration date when generating the JWT, just enough to refresh the access_token. This reduces the risk in the event the JWT gets leaked.
What's next