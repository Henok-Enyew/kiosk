import { ApiError, NetworkError } from '../src/api/client';
import { strings } from '../src/i18n/strings';
import { enrollErrorMessage } from '../src/screens/SupervisorScreen';

test('a server failure while enrolling gets an actionable message', () => {
  expect(enrollErrorMessage(new ApiError(500, 'Internal server error'))).toBe(
    strings.supervisor.serverFailed,
  );
  expect(enrollErrorMessage(new NetworkError())).toBe(strings.staff.online);
  expect(enrollErrorMessage(new ApiError(400, 'Employee is archived'))).toBe(
    'Employee is archived',
  );
  expect(enrollErrorMessage('boom')).toBe(strings.errors.generic);
});
