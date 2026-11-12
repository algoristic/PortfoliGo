import {
  EngineCommandError,
  EngineServiceErrorCode,
} from '../../data-access/service/engine.service';

export function isEngineCommandError(
  error: unknown,
  code?: EngineServiceErrorCode,
): error is EngineCommandError {
  return error instanceof EngineCommandError && (code === undefined || error.code === code);
}
