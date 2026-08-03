import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'NVIDIA SA Academy',
  tagline: 'Senior DevOps and AI Infrastructure mastery',
  favicon: 'img/favicon.svg',
  url: 'https://jithinpnjm.github.io',
  baseUrl: '/nvidia-devops/',
  organizationName: 'jithinpnjm',
  projectName: 'nvidia-devops',
  staticDirectories: ['public'],
  trailingSlash: false,
  customFields: {tutorBackendUrl: process.env.TUTOR_BACKEND_URL || ''},
  onBrokenLinks: 'throw',
  markdown: {mermaid: true, hooks: {onBrokenMarkdownLinks: 'throw'}},
  themes: ['@docusaurus/theme-mermaid'],
  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: 'curriculum',
          showLastUpdateTime: true,
          breadcrumbs: true,
        },
        blog: false,
        pages: {remarkPlugins: []},
        theme: {customCss: './src/css/custom.css'},
      } satisfies Preset.Options,
    ],
  ],
  plugins: [
    [
      require.resolve('@easyops-cn/docusaurus-search-local'),
      {
        hashed: true,
        indexDocs: true,
        indexPages: true,
        docsRouteBasePath: '/curriculum',
        highlightSearchTermsOnTargetPage: true,
        searchResultLimits: 12,
        searchResultContextMaxLength: 80,
      },
    ],
  ],
  themeConfig: {
    colorMode: {defaultMode: 'dark', disableSwitch: false, respectPrefersColorScheme: false},
    mermaid: {
      theme: {light: 'base', dark: 'base'},
      options: {
        themeVariables: {
          primaryColor: '#76b900', primaryTextColor: '#0d110f', primaryBorderColor: '#568c0b',
          lineColor: '#8acb25', secondaryColor: '#f4f6f3', secondaryTextColor: '#0d110f',
          tertiaryColor: '#f4f6f3', tertiaryTextColor: '#0d110f', textColor: '#0d110f',
          edgeLabelBackground: '#f4f6f3', nodeTextColor: '#0d110f', clusterBkg: '#f4f6f3', clusterBorder: '#ccd5ca',
          fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif', fontSize: '15px',
          background: '#f4f6f3',
          actorBkg: '#76b900', actorBorder: '#568c0b', actorTextColor: '#0d110f', actorLineColor: '#568c0b',
          signalColor: '#0d110f', signalTextColor: '#0d110f',
          labelBoxBkgColor: '#f4f6f3', labelBoxBorderColor: '#ccd5ca', labelTextColor: '#0d110f',
          loopTextColor: '#0d110f', noteBkgColor: '#f4f6f3', noteBorderColor: '#ccd5ca', noteTextColor: '#0d110f',
          activationBorderColor: '#568c0b', activationBkgColor: '#e7ecdf', sequenceNumberColor: '#0d110f',
        },
      },
    },
    navbar: {
      title: 'NVIDIA SA Academy',
      hideOnScroll: false,
      items: [
        {to: '/', label: 'Home', position: 'left'},
        {to: '/curriculum/intro/master-index', label: 'Curriculum', position: 'left'},
        {to: '/visuals', label: 'Visuals', position: 'left'},
        {to: '/labs', label: 'Labs', position: 'left'},
        {to: '/troubleshooting', label: 'Troubleshooting', position: 'left'},
        {to: '/architecture', label: 'Architecture', position: 'left'},
        {to: '/interview', label: 'Interview', position: 'left'},
        {to: '/tutor', label: 'Tutor', position: 'left'},
        {to: '/resources', label: 'Resources', position: 'left'},
        {to: '/progress', label: 'Progress', position: 'left'},
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {title: 'Learn', items: [{label: 'Curriculum', to: '/curriculum/intro/master-index'}, {label: 'Labs', to: '/labs'}]},
        {title: 'Practice', items: [{label: 'Troubleshooting', to: '/troubleshooting'}, {label: 'Interview', to: '/interview'}]},
      ],
      copyright: `Public technical learning platform · ${new Date().getFullYear()}`,
    },
    prism: {
      additionalLanguages: ['bash', 'python', 'yaml', 'json', 'promql'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
