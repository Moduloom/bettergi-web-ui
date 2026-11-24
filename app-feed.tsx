import {useState} from 'react';
import {Button, Switch, Text} from './controls';
import {Empty, SettingsRow} from './collections';
import {Modal} from './overlays';
import {Image} from './media';
import {logoSource} from './app-images';
import {useAppValue} from './app-state';

export function FeedDialog({open, onChange}: {open: boolean; onChange: (open: boolean) => void}) {
  const [server, setServer] = useState<'cn' | 'global'>('cn');
  const [notifications, setNotifications] = useAppValue('feed/notifications', {cn: false, global: false});
  const label = server === 'cn' ? '国服' : '国际服';
  return <Modal title="兑换码" iconContent={<Image src={logoSource} width={16} height={16} alt=""/>}
    open={open} onChange={onChange} width={400} height={700}
    actions={<Button onClick={() => onChange(false)}>关闭</Button>}>
    <div className="bgi-feed-window bgi-stack">
      <Text variant="section">最新兑换码动态</Text>
      <Text variant="caption">查看最新的原神兑换码，一键自动兑换</Text>
      <div className="bgi-feed-servers" role="group" aria-label="兑换码服务器">
        <Button icon="gift" appearance={server === 'cn' ? 'primary' : 'default'}
          aria-pressed={server === 'cn'} onClick={() => setServer('cn')}>国服</Button>
        <Button icon="cloud" appearance={server === 'global' ? 'primary' : 'default'}
          aria-pressed={server === 'global'} onClick={() => setServer('global')}>国际服</Button>
      </div>
      <Empty title={'暂无' + label + '兑换码'} icon="gift"/>
      <SettingsRow label="兑换码更新通知" description={'开启后有新的' + label + '兑换码时提醒'}
        control={<Switch label={label + '兑换码更新通知'} checked={notifications[server]} showLabel={false}
          onChange={checked => setNotifications(previous => ({...previous, [server]: checked}))}/>}/>
    </div>
  </Modal>;
}
