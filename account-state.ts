import {useAppValue} from './app-state';

export type Account = {
  id: string; name: string; uid: string; server: string;
  loginMode?: string; loginText?: string;
};
const empty: Account[] = [];

export function useAccounts() {
  return useAppValue('accounts', empty);
}

export const servers = [
  {value: 'cn', label: '国服 / 亚服 / 港澳台（UTC+8）'},
  {value: 'europe', label: '欧服（UTC+1）'}, {value: 'america', label: '美服（UTC−5）'},
];

export function accountServer(server: string) {
  return server === 'america' || server === 'europe' ? server : 'cn';
}
