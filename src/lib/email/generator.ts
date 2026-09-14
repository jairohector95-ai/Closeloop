import { renderFollowUpEmail, type EmailContext, type GeneratedEmail } from "./templates";

/**
 * Abstraction over "how do we write the words of a follow-up".
 *
 * Phase 1: templates. Phase 2: an `OpenAIEmailGenerator` can implement the
 * same interface and personalize using the quote notes and customer history.
 */
export interface EmailGenerator {
  generate(ctx: EmailContext): GeneratedEmail;
}

export class TemplateEmailGenerator implements EmailGenerator {
  generate(ctx: EmailContext): GeneratedEmail {
    return renderFollowUpEmail(ctx);
  }
}

export const defaultEmailGenerator: EmailGenerator = new TemplateEmailGenerator();
