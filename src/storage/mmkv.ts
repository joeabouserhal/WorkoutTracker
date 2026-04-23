import { createMMKV } from 'react-native-mmkv'

export const storage = createMMKV()

export const getString = (key: string): string | undefined =>
  storage.getString(key)

export const setString = (key: string, value: string): void =>
  storage.set(key, value)

export const getBool = (key: string): boolean | undefined =>
  storage.getBoolean(key)

export const setBool = (key: string, value: boolean): void =>
  storage.set(key, value)

export const removeKey = (key: string): void => {
  storage.remove(key)
}
