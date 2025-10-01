// Error types import
import { 
  MissingBindGroupsError, 
  MissingLinksError, 
  MissingSlotValueError, 
  ResolutionError 
} from 'typegpu';

console.log('Error types:', {
  MissingBindGroupsError: typeof MissingBindGroupsError,
  MissingLinksError: typeof MissingLinksError,
  MissingSlotValueError: typeof MissingSlotValueError,
  ResolutionError: typeof ResolutionError,
});