import { ConflictError, NotFoundError } from '../../lib/errors/errors.ts';

/** No such group, or it is suspended until the team reviews it. */
export class CommunityGroupNotFoundError extends NotFoundError {
  constructor() {
    super('This group is not available.', undefined, 'COMMUNITY_GROUP_NOT_FOUND');
  }
}

/** Gabung Grup before accepting the current Aturan Komunitas Kira. */
export class CommunityRulesNotAcceptedError extends ConflictError {
  constructor() {
    super('Accept the community rules first.', undefined, 'COMMUNITY_RULES_NOT_ACCEPTED');
  }
}

/** The group's invite link is being checked again by the team (none is set yet). */
export class CommunityLinkUnavailableError extends ConflictError {
  constructor() {
    super('This group link is being checked again.', undefined, 'COMMUNITY_LINK_UNAVAILABLE');
  }
}

/** The person's earlier report on this group is still open. */
export class CommunityReportDuplicateError extends ConflictError {
  constructor() {
    super('You already reported this group.', undefined, 'COMMUNITY_REPORT_DUPLICATE');
  }
}

/** No such Etalase product, or it is no longer listed. */
export class CommunityProductNotFoundError extends NotFoundError {
  constructor() {
    super('This product is not available.', undefined, 'COMMUNITY_PRODUCT_NOT_FOUND');
  }
}
