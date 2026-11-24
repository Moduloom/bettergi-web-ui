import {useState} from 'react';
import {Button, Input, Link, SearchField, Select, Text} from './controls';
import {Empty, List, SettingsList, SettingsRow, Tabs} from './collections';
import {Modal} from './overlays';
import {Image} from './media';
import {logoSource} from './app-images';
import {useAppValue} from './app-state';

const desktop = '由本机 BetterGI 脚本仓库服务处理';
const repoTabs = [{value: 'git', label: 'Git一键更新'},
  {value: 'online', label: '在线下载'}, {value: 'manual', label: '手动导入'}];
const channels = [{value: 'cnb', label: 'CNB'}, {value: 'github', label: 'GitHub'}, {value: 'custom', label: '自定义'}];
const channelUrls: Record<string, string> = {
  cnb: 'https://cnb.cool/bettergi/bettergi-scripts-list',
  github: 'https://github.com/babalae/bettergi-scripts-list',
};
const repoDocs = 'https://www.bettergi.com/feats/autos/srepo.html';
const windowLogo = <Image src={logoSource} alt="" width={16} height={16}/>;

export function TaskRepositoryDialog({open, onChange, onOpenLocal}: {
  open: boolean; onChange: (value: boolean) => void; onOpenLocal: () => void;
}) {
  const [tab, setTab] = useState('git');
  const [channel, setChannel] = useAppValue('script-repo/channel', 'cnb');
  const [custom, setCustom] = useAppValue('script-repo/custom-url', '');
  const [username, setUsername] = useAppValue('script-repo/username', '');
  const [download, setDownload] = useAppValue('script-repo/download-url', '');
  return <Modal title="脚本仓库" iconContent={windowLogo} width={410} open={open} onChange={onChange}
    actions={<>
      <Button onClick={() => {onChange(false); onOpenLocal();}}>打开仓库</Button>
      <Button appearance="primary" disabled title={desktop}>一键更新订阅</Button>
    </>}>
    <div className="bgi-stack">
      <Tabs label="脚本仓库" options={repoTabs} value={tab} onChange={setTab}/>
      {tab === 'git' ? <>
        <SettingsList>
          <SettingsRow inline label="更新渠道" control={<Select label="更新渠道" options={channels}
            value={channel} onValueChange={setChannel}/>}/>
          <SettingsRow inline label="仓库地址" stacked control={<Input aria-label="仓库地址" type="url"
            value={channel === 'custom' ? custom : channelUrls[channel] ?? ''} readOnly={channel !== 'custom'}
            onChange={event => setCustom(event.currentTarget.value)}/>}/>
          {channel === 'custom' && <>
            <SettingsRow inline label="用户名称" control={<Input aria-label="用户名称" value={username}
              onChange={event => setUsername(event.currentTarget.value)}/>}/>
            <SettingsRow inline label="访问令牌" control={<Input aria-label="访问令牌" type="password" disabled title={desktop}/>}/>
          </>}
        </SettingsList>
        <div className="bgi-actions"><Button appearance="primary" disabled title={desktop}>更新仓库</Button>
          <Button disabled title={desktop}>重置仓库</Button></div>
      </> : tab === 'online' ? <>
        <Text variant="body">从在线地址直接下载脚本仓库压缩包，适用于网络环境较好的情况。</Text>
        <SettingsRow inline label="下载地址" stacked control={<Input aria-label="下载地址" type="url"
          value={download} onChange={event => setDownload(event.currentTarget.value)}/>}/>
        <div className="bgi-actions"><Button appearance="primary" disabled title={desktop}>下载并导入</Button></div>
      </> : <>
        <Text variant="body">从本地 zip 文件导入脚本仓库，适用于离线环境或网络不稳定的情况。</Text>
        <Text variant="caption">请选择包含脚本仓库内容的 zip 压缩包。可以从 <Link href={repoDocs}>脚本仓库文档</Link> 获取。</Text>
        <div className="bgi-actions"><Button appearance="primary" disabled title={desktop}>选择 zip 文件导入</Button></div>
      </>}
    </div>
  </Modal>;
}

type Script = {id: string; label: string; filename: string; content: string};

export function ArtifactScriptDialog({open, onChange, onCopy}: {
  open: boolean; onChange: (value: boolean) => void; onCopy: (content: string) => void;
}) {
  const [scripts] = useAppValue<Script[]>('library/scripts', []);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState('');
  const current = scripts.find(item => item.id === selected);
  const visible = scripts.filter(item => (item.label + item.filename).toLowerCase().includes(filter.trim().toLowerCase()));
  return <Modal title="请选择需要复制的JS脚本" width={500} open={open} onChange={onChange}
    actions={<><Button onClick={() => onChange(false)}>取消</Button>
      <Button appearance="primary" disabled={!current} onClick={() => {
        if (!current) return;
        onCopy(current.content);
        onChange(false);
      }}>确定</Button></>}>
    <div className="bgi-stack">
      <SearchField label="搜索脚本" value={filter} onChange={setFilter}/>
      {visible.length ? <List rows={visible.map(item => ({id: item.id, label: item.label, detail: item.filename, icon: 'fileCode'}))}
        selected={selected} onSelect={setSelected}/> : <Empty title={filter ? '没有匹配的脚本' : '暂无 JS 脚本'} />}
    </div>
  </Modal>;
}

export function ArtifactOcrDialog({open, onChange}: {open: boolean; onChange: (value: boolean) => void}) {
  return <Modal title="圣遗物分解" iconContent={windowLogo} open={open} onChange={onChange}
    actions={<>
      <Button icon="rotate" appearance="primary" disabled title="需要本机 BetterGI 的截图和 OCR 接口">刷新</Button>
      <Button onClick={() => onChange(false)}>退出</Button>
    </>}>
    <div className="bgi-stack bgi-artifact-test">
      <div className="bgi-artifact-preview"><Image src={logoSource} alt="识别截图" fit="contain"/></div>
      <div className="bgi-cascade"><Input aria-label="识别原文" value="" readOnly/>
        <Input aria-label="识别结构" value="" readOnly/></div>
      <Input aria-label="匹配结果" value="" readOnly/>
    </div>
  </Modal>;
}
