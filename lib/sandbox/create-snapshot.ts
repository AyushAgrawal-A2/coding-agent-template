import { Sandbox } from '@vercel/sandbox'
import { runCommandInSandbox } from './commands'

async function createSnapshot() {
  const sandboxConfig = {
    teamId: process.env.SANDBOX_VERCEL_TEAM_ID!,
    projectId: process.env.SANDBOX_VERCEL_PROJECT_ID!,
    token: process.env.SANDBOX_VERCEL_TOKEN!,
    timeout: 30 * 60 * 1000, // 30 minutes
    runtime: 'node24',
    resources: { vcpus: 4 },
  }

  const sandbox = await Sandbox.create(sandboxConfig)

  // Clean dnf cache first to avoid corruption issues
  await runCommandInSandbox(sandbox, 'sh', ['-c', 'sudo dnf clean all 2>&1'])

  console.log('Installing system dependencies for Chromium...')

  // Critical packages for Chromium - install in groups to be resilient
  const criticalDeps = ['nss', 'nspr']
  const displayDeps = ['libxkbcommon', 'atk', 'at-spi2-atk', 'at-spi2-core']
  const xDeps = [
    'libXcomposite',
    'libXdamage',
    'libXrandr',
    'libXfixes',
    'libXcursor',
    'libXi',
    'libXtst',
    'libXScrnSaver',
    'libXext',
  ]
  const graphicsDeps = ['mesa-libgbm', 'libdrm', 'mesa-libGL', 'mesa-libEGL']
  const otherDeps = ['cups-libs', 'alsa-lib', 'pango', 'cairo', 'gtk3', 'dbus-libs']

  console.log('Installing critical dependencies...')

  // Install critical deps first
  const criticalResult = await runCommandInSandbox(sandbox, 'sh', [
    '-c',
    `sudo dnf install -y ${criticalDeps.join(' ')} 2>&1`,
  ])
  if (!criticalResult.success) {
    await runCommandInSandbox(sandbox, 'sh', [
      '-c',
      `sudo dnf install -y --allowerasing ${criticalDeps.join(' ')} 2>&1`,
    ])
  }

  console.log('Installing other dependencies...')

  // Install other deps with --skip-broken
  const allOtherDeps = [...displayDeps, ...xDeps, ...graphicsDeps, ...otherDeps]
  await runCommandInSandbox(sandbox, 'sh', ['-c', `sudo dnf install -y --skip-broken ${allOtherDeps.join(' ')} 2>&1`])

  // Run ldconfig to update library cache
  await runCommandInSandbox(sandbox, 'sh', ['-c', 'sudo ldconfig 2>&1'])

  console.log('Installing agent-browser...')

  const agentBrowserInstall = await runCommandInSandbox(sandbox, 'npm', ['install', '-g', 'agent-browser'])
  if (!agentBrowserInstall.success) {
    throw new Error('Failed to install agent-browser')
  }

  console.log('Creating snapshot...')

  const snapshot = await sandbox.snapshot()

  console.log('Stopping sandbox...')

  await sandbox.stop()

  return snapshot.snapshotId
}

createSnapshot()
  .then((snapshotId) => {
    console.log(`Snapshot created: ${snapshotId}`)
  })
  .catch((error) => {
    console.error('Error creating snapshot:', error)
  })
