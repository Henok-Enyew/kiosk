import { PermissionsAndroid } from 'react-native';

export async function ensureCameraPermission(): Promise<boolean> {
  const permission = PermissionsAndroid.PERMISSIONS.CAMERA;
  if (await PermissionsAndroid.check(permission)) return true;
  const result = await PermissionsAndroid.request(permission);
  return result === PermissionsAndroid.RESULTS.GRANTED;
}
