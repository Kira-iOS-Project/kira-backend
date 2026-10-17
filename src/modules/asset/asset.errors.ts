import { NotFoundError } from '../../lib/errors/errors.ts';

export class AssetNotFoundError extends NotFoundError {
  constructor() {
    super('The asset was not found.', undefined, 'ASSET_NOT_FOUND');
  }
}
