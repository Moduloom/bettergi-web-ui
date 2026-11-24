import {useEffect, useState, type ReactNode} from 'react';
import {Button, Field, NumberField, RadioGroup, Select, Switch, Text} from '../../components/controls';
import {Card, Expander, SettingsActionRow, SettingsList, SettingsRow, Toolbar} from '../../components/collections';
import {DropMenu, Modal, Snackbar, useSnackbar} from '../../components/overlays';
import {useAppValue} from '../../app/app-state';

const backends = [
  {value: 'ONNX Runtime', label: 'ONNX Runtime', description: '按显卡/处理器挑选执行设备', badge: '当前使用'},
  {value: 'ncnn', label: 'ncnn', description: '计算模式：Vulkan 显卡 / CPU'},
];
const engines = [
  {value: 'CPU', label: 'CPU', description: '在处理器上运行模型', badge: '当前使用'},
  {value: 'DirectML', label: 'DirectML', description: '使用 DirectX 12 显卡'},
  {value: 'OpenVINO', label: 'OpenVINO', description: '使用 Intel 设备执行推理'},
  {value: 'CUDA', label: 'CUDA', description: '使用 NVIDIA 显卡'},
];
const cpuPolicies = [
  {value: 'follow', label: '跟随全局设置', description: '使用 CPU 卡片中的全局线程数。'},
  {value: 'auto', label: '运行库自动调度', description: '不指定线程参数，由 ONNX Runtime 决定。'},
  {value: 'game', label: '游戏流畅优先', description: '限制 OCR 的并行线程，减少游戏掉帧。'},
  {value: 'custom', label: '自定义设置', description: '分别指定文本检测、文字识别和模型节点的线程数。'},
];
const computeModes = [
  {value: 'Vulkan', label: 'Vulkan', description: '调用 Vulkan 显卡。'},
  {value: 'CPU', label: 'CPU', description: '使用处理器线程推理。'},
];
const tuningNames = ['文本检测（Det）', '文本识别（Rec）', 'YOLO'];
const tuningGroups = [
  {title: '精度与量化（8 项）', description: 'FP16 / INT8 / BF16 的存储与算术开关', flags: [
    ['FP16 打包', true], ['FP16 存储', true], ['FP16 算术', true], ['BF16 存储', false],
    ['INT8 推理', true], ['INT8 打包', true], ['INT8 存储', true], ['INT8 算术', true],
  ]},
  {title: '卷积优化（6 项）', description: 'Winograd / SGEMM / 打包布局', flags: [
    ['Winograd 卷积', true], ['Winograd 2×3', true], ['Winograd 4×3', true], ['Winograd 6×3', true],
    ['SGEMM 卷积', true], ['打包布局（packing）', true],
  ]},
  {title: 'Vulkan 细节（6 项）', description: 'Cooperative Matrix 与着色器设置', flags: [
    ['Cooperative Matrix', true], ['FP16 uniform 传递', true], ['INT16 打包', true],
    ['Shader 本地内存', true], ['A53 / A55 优化核', false], ['像素直输', false],
  ]},
] as const;
const threadOptions = Array.from({length: 16}, (_, index) => ({value: String(index + 1), label: String(index + 1)}));
const sessionOptions = threadOptions.slice(0, 4);
type Tuning = {threads: string; gpuThreads: string; sessions: string; flags: Record<string, boolean>};
const defaultTuning = (): Tuning => ({
  threads: '4', gpuThreads: '1', sessions: '1',
  flags: Object.fromEntries(tuningGroups.flatMap(group => group.flags.map(([name, enabled]) => [name, enabled] as const))),
});
type HardwareDraft = {
  backend: string; engine: string; ocrCpu: boolean; threads: number; profile: string;
  detThreads: number; recThreads: number; parallel: boolean; nodeThreads: number; spinning: boolean;
  cache: Record<string, boolean>; ncnnMode: string; ncnnOcr: boolean; ncnnYolo: boolean; tunings: Tuning[];
};
const defaultHardware = (): HardwareDraft => ({
  backend: 'ONNX Runtime', engine: 'CPU', ocrCpu: true, threads: 0, profile: 'follow',
  detThreads: 0, recThreads: 0, parallel: false, nodeThreads: 0, spinning: true,
  cache: {}, ncnnMode: 'CPU', ncnnOcr: true, ncnnYolo: true, tunings: tuningNames.map(defaultTuning),
});
const previewOnly = '预览界面';

function HardwareSection({title, description, children}: {
  title: string; description?: string; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return <Expander title={title} description={description} icon={null} open={open} onChange={setOpen}>
    <div className="bgi-stack">{children}</div>
  </Expander>;
}

function ThreadSetting({label, value, onChange}: {label: string; value: number; onChange: (value: number) => void}) {
  return <SettingsRow inline label={label} controlWidth={132}
    control={<NumberField label={label} value={value} min={0} max={128} onChange={onChange}/>}/>;
}

function OnnxSettings({draft, update}: {draft: HardwareDraft; update: (patch: Partial<HardwareDraft>) => void}) {
  return <>
    <Text variant="section">执行引擎</Text>
    <RadioGroup label="执行引擎" options={engines} value={draft.engine} cards onChange={engine => update({engine})}/>
    {draft.engine !== 'CPU' && <Card title={draft.engine}>
      <SettingsList separated>
        <SettingsRow inline label="执行设备" control={<Select label="执行设备" value="default"
          options={[{value: 'default', label: '默认设备'}]} onValueChange={() => {}}/>}/>
        <SettingsRow inline label="启用模型缓存" control={<Switch label="启用模型缓存" showLabel={false}
          checked={draft.cache[draft.engine] ?? true}
          onChange={enabled => update({cache: {...draft.cache, [draft.engine]: enabled}})}/>}/>
        <SettingsActionRow inline label="运行库" action={<Button disabled title={previewOnly}>下载运行库</Button>}/>
      </SettingsList>
    </Card>}
    <Card title="CPU 设置">
      <SettingsList separated>
        <SettingsRow inline label="OCR 使用 CPU" description="关闭后 OCR 跟随所选推理引擎。"
          control={<Switch label="OCR 使用 CPU" checked={draft.ocrCpu} showLabel={false} onChange={ocrCpu => update({ocrCpu})}/>}/>
        <ThreadSetting label="通用 CPU 推理线程数" value={draft.threads} onChange={threads => update({threads})}/>
      </SettingsList>
    </Card>
    <HardwareSection title="高级 OCR CPU 线程策略">
      <Field label="选择配置方案">
        <RadioGroup label="选择配置方案" options={cpuPolicies} cards value={draft.profile} onChange={profile => update({profile})}/>
      </Field>
      {draft.profile === 'custom' && <>
        <Text variant="subtitle">自定义线程设置</Text>
        <SettingsList separated>
          <ThreadSetting label="文本检测线程数" value={draft.detThreads} onChange={detThreads => update({detThreads})}/>
          <ThreadSetting label="文字识别线程数" value={draft.recThreads} onChange={recThreads => update({recThreads})}/>
          <SettingsRow inline label="启用模型节点并行" control={<Switch label="启用模型节点并行" checked={draft.parallel}
            showLabel={false} onChange={parallel => update({parallel})}/>}/>
          {draft.parallel && <ThreadSetting label="模型节点并行线程数" value={draft.nodeThreads}
            onChange={nodeThreads => update({nodeThreads})}/>}
          <SettingsRow inline label="启用低延迟线程等待" control={<Switch label="启用低延迟线程等待"
            checked={draft.spinning} showLabel={false} onChange={spinning => update({spinning})}/>}/>
        </SettingsList>
      </>}
    </HardwareSection>
  </>;
}

function NcnnSettings({draft, update}: {draft: HardwareDraft; update: (patch: Partial<HardwareDraft>) => void}) {
  function setTuning(index: number, updateTuning: Tuning) {
    update({tunings: draft.tunings.map((item, position) => position === index ? updateTuning : item)});
  }

  return <>
    <Text variant="section">用途分配</Text>
    <Card title="OCR 文本检测与识别（Det + Rec）使用 ncnn"
      action={<Switch label="OCR 使用 ncnn" showLabel={false} checked={draft.ncnnOcr}
        onChange={ncnnOcr => update({ncnnOcr})}/>}/>
    <Card title="YOLO 使用 ncnn" action={<Switch label="YOLO 使用 ncnn" checked={draft.ncnnYolo} showLabel={false}
      onChange={ncnnYolo => update({ncnnYolo})}/>}/>
    <Text variant="section">计算模式</Text>
    <RadioGroup label="ncnn 计算模式" cards options={computeModes} value={draft.ncnnMode}
      onChange={ncnnMode => update({ncnnMode})}/>
    {draft.ncnnMode === 'Vulkan' && <SettingsRow inline label="推理设备" control={<Select label="ncnn Vulkan 推理设备"
      value="default" options={[{value: 'default', label: '默认设备'}]} onValueChange={() => {}}/>}/>}
    <HardwareSection title="高级">
      <Text variant="subtitle">模型资产</Text>
      <SettingsList separated>
        {tuningNames.map(name => <SettingsActionRow key={name} inline label={name}
          action={<Button disabled title={previewOnly}>明细</Button>}/>)}
      </SettingsList>
      <Text variant="subtitle">调优参数</Text>
      {tuningNames.map((name, index) => {
        const tuning = draft.tunings[index] ?? defaultTuning();
        return <HardwareSection key={name} title={name}>
          <div className="bgi-actions"><Button onClick={() => setTuning(index, defaultTuning())}>恢复本套默认</Button></div>
          <div className="bgi-hardware-grid">
            <Field label="CPU 模式线程数"><Select label={name + ' CPU 模式线程数'} options={threadOptions}
              value={tuning.threads} onValueChange={threads => setTuning(index, {...tuning, threads})}/></Field>
            <Field label="Vulkan 模式线程数"><Select label={name + ' Vulkan 模式线程数'} options={threadOptions}
              value={tuning.gpuThreads} onValueChange={gpuThreads => setTuning(index, {...tuning, gpuThreads})}/></Field>
            <Field label="并行会话数"><Select label="并行会话数" options={sessionOptions}
              value={tuning.sessions} onValueChange={sessions => setTuning(index, {...tuning, sessions})}/></Field>
          </div>
          {tuningGroups.map(group => <HardwareSection key={group.title} title={group.title} description={group.description}>
            <SettingsList separated>{group.flags.map(([name]) => <SettingsRow key={name} inline label={name}
              control={<Switch label={name} checked={tuning.flags[name] ?? false} showLabel={false}
                onChange={checked => setTuning(index, {...tuning, flags: {...tuning.flags, [name]: checked}})}/>}/>)}</SettingsList>
          </HardwareSection>)}
        </HardwareSection>;
      })}
      <Text variant="subtitle">诊断</Text>
      <SettingsActionRow inline label="模型输入输出" action={<Button disabled title={previewOnly}>探测 blob 名</Button>}/>
    </HardwareSection>
  </>;
}

export function HardwareSettings({open, onClose}: {open: boolean; onClose: () => void}) {
  const [legacyBackend] = useAppValue('hardware/backend', 'ONNX Runtime');
  const [legacyEngine] = useAppValue('hardware/engine', 'CPU');
  const [saved, setSaved] = useAppValue<HardwareDraft>('hardware/preview', {
    ...defaultHardware(), backend: legacyBackend === 'ncnn' ? 'ncnn' : 'ONNX Runtime',
    engine: legacyBackend === 'OpenVINO' ? 'OpenVINO' : engines.some(item => item.value === legacyEngine) ? legacyEngine : 'CPU',
  });
  const [draft, setDraft] = useState(saved);
  const {notify, snackbar} = useSnackbar();
  const update = (patch: Partial<HardwareDraft>) => setDraft(previous => ({...previous, ...patch}));
  useEffect(() => {if (open) setDraft(saved);}, [open]);

  return <>
    <Modal title="推理引擎设置" open={open} onChange={value => {if (!value) onClose();}} wide width={850} maxHeight={690}
      actions={<div className="bgi-hardware-footer">
        <Text variant="strong">已选择：{draft.backend === 'ncnn' ? 'ncnn · ' + draft.ncnnMode : draft.engine}</Text>
        <div className="bgi-actions">
          <Button onClick={() => {
            const initial = defaultHardware();
            setSaved(initial);
            setDraft(initial);
            notify('已恢复预览默认设置', 'success');
          }}>恢复默认并保存</Button>
          <Button appearance="primary" disabled title={previewOnly}>应用并重启</Button>
        </div>
      </div>}>
      <div className="bgi-stack">
        <Toolbar actions={<Button appearance="transparent" disabled title={previewOnly}>重新检测</Button>}>
          <Text variant="section">推理后端</Text>
        </Toolbar>
        <Text variant="caption">各后端设置互相独立。切换只改草稿，点击「应用并重启」后生效。</Text>
        <RadioGroup label="推理后端" options={backends} value={draft.backend} cards onChange={backend => update({backend})}/>
        {draft.backend === 'ncnn' ? <NcnnSettings draft={draft} update={update}/> : <OnnxSettings draft={draft} update={update}/>}
        <HardwareSection title="性能测试">
          <div className="bgi-hardware-grid">
            <Card title="OCR 文本识别">
              <div className="bgi-stack"><Button disabled title={previewOnly}>开始 OCR 测速</Button>
                <Text variant="caption">还没有测速结果</Text></div>
            </Card>
            <Card title="古树检测">
              <div className="bgi-stack"><Button disabled title={previewOnly}>开始古树测速</Button>
                <Text variant="caption">还没有测速结果</Text></div>
            </Card>
          </div>
        </HardwareSection>
        <div>
          <DropMenu label="更多" items={[
            {id: 'runtime', label: '打开运行库目录', disabled: true},
            {id: 'cache', label: '打开模型缓存目录', disabled: true},
          ]} onSelect={() => {}}/>
        </div>
      </div>
    </Modal>
    <Snackbar {...snackbar}/>
  </>;
}
