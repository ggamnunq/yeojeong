import { Global, Module } from '@nestjs/common';
import { GoogleOidcVerifier } from './google-oidc-verifier.js';

@Global()
@Module({
  providers: [GoogleOidcVerifier],
  exports: [GoogleOidcVerifier],
})
export class InternalJobModule {}
