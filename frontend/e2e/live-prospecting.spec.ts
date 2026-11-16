import {test,expect} from '@playwright/test'

test('multiword research markets can be typed and saved', async ({ page }) => {
  const settings = { markets: ['Singapore'], intervalMinutes: 240, enabled: false, maxCandidates: 3 }
  const state = { settings, run: null, leads: [], history: [], sourceCatalogue: [] }
  await page.route('**/api/v1/prospecting**', route => route.fulfill({ json: state }))
  await page.goto('/lead-ranking')
  const markets = page.getByLabel('Markets (comma separated)')
  await expect(markets).toHaveValue('Singapore')
  await markets.fill('')
  await markets.pressSequentially('New Zealand, South Korea')
  const request = page.waitForRequest(req => req.url().endsWith('/prospecting/settings') && req.method() === 'POST')
  await page.getByRole('button', { name: 'Save settings', exact: true }).click()
  expect((await request).postDataJSON().markets).toEqual(['New Zealand', 'South Korea'])
})

test('research interval persists and can be paused without creating mock leads',async({page,request})=>{
 await page.goto('/lead-ranking')
 await expect(page.getByRole('heading',{name:'Research settings'})).toBeVisible()
 await expect(page.getByLabel(/Industries/)).toHaveCount(0)
 await expect(page.getByRole('button',{name:'Demo checks',exact:true})).toHaveCount(0)
 const interval=page.getByLabel(/Research every/)
 await interval.fill('60')
 await page.getByLabel('Automatic research',{exact:true}).check()
 await page.getByRole('button',{name:'Save settings',exact:true}).click()
 await expect(page.getByText(/Next run:/)).not.toContainText('Not scheduled')
 const saved=await(await request.get('http://127.0.0.1:5010/api/v1/prospecting')).json()
 expect(saved.settings.intervalMinutes).toBe(60);expect(saved.settings.enabled).toBe(true);expect(saved.leads).toEqual([])
 expect(saved.settings).not.toHaveProperty('industries')
 await page.getByLabel('Automatic research',{exact:true}).uncheck()
 await page.getByRole('button',{name:'Save settings',exact:true}).click()
 await expect(page.getByText(/Next run:/)).toContainText('Not scheduled')
})

test('fresh research remains inspectable when a service hypothesis cannot yet be supported',async({page})=>{
 const source={id:'source-current',title:'Example Retail opens a branch',url:'https://example.com/news',publishedAt:'2026-11-10T00:00:00Z',retrievedAt:'2026-11-15T00:00:00Z',verification:'headline_only',excerpt:'Retrieved report used only as a browser test fixture.'}
 const company={id:'retail-test',name:'Example Retail',description:'Retail company',score:0,whyNow:'Reported branch opening',fitStatus:'NEEDS_RESEARCH',fitReason:'Sources retrieved; AI provider is temporarily unavailable.',analysisOrigin:'sources_only',researchId:'research-retail-test',researchedAt:source.retrievedAt,relationship:'UNKNOWN',model:null,website:null,sources:[source],analysis:{summary:'Example Retail reported a branch opening.',possibleNeeds:[],recommendedCapability:null,nextAction:{role:'IT manager',question:'What requirements are confirmed?',whyNow:'Review current sources.'},unknowns:['Budget not verified']}}
 const state:any={settings:{markets:['Singapore'],intervalMinutes:240,enabled:false,maxCandidates:15},nextRunAt:null,run:null,leads:[],reviewedCompanies:[],displayMode:'completed',history:[],sourceCatalogue:[],scheduler:{storage:'temporary local memory',externalWakeConfigured:false}}
 await page.route('**/api/v1/prospecting**',async route=>{
  if(route.request().url().endsWith('/run')){state.run={status:'researching',cursor:1,candidateCount:15,qualifiedCount:0,currentCompany:'Next Company',failures:[],sourceReports:[]};state.reviewedCompanies=[company];state.displayMode='previous_run'}
  await route.fulfill({status:200,json:state})
 })
 await page.goto('/lead-ranking')
 await page.getByRole('button',{name:'Research now',exact:true}).click()
 await expect(page.getByRole('heading',{name:'Company research · 1'})).toBeVisible()
 await expect(page.getByRole('heading',{name:'Top 0 companies'})).toBeVisible()
 await page.getByRole('button',{name:'Open research for Example Retail'}).click()
 const details=page.getByRole('region',{name:'Research details for Example Retail'})
 await expect(details).toContainText('AI provider is temporarily unavailable')
 await expect(details.getByRole('link',{name:source.title})).toHaveAttribute('href',source.url)
 await expect(details).toContainText('Review the company evidence and use the discovery question')
 await expect(page.getByRole('status')).toContainText('New company reports appear as each finishes')
})

test('company hover and details show cited hypotheses; starting research preserves the previous list',async({page})=>{
 const source={id:'test-source',title:'Example Manufacturing opens a facility',url:'https://example.com/press',publishedAt:'2026-11-10T00:00:00Z',retrievedAt:'2026-11-15T00:00:00Z',verification:'headline_only',excerpt:'Test-only UI contract fixture.'}
 const lead={id:'test-company',name:'Example Manufacturing',description:'Test fixture company',score:60,whyNow:'A reported facility creates a connectivity discovery question.',researchId:'research-test',researchedAt:'2026-11-15T00:00:00Z',relationship:'UNKNOWN',model:'test-model',website:null,sources:[source],analysis:{summary:'A reported new facility.',possibleNeeds:[{serviceName:'Business connectivity',offeringId:'business-connectivity',need:'May need site connectivity.',reason:'Reported new facility.',evidenceIds:[source.id]}],recommendedCapability:null,nextAction:{role:'IT manager',question:'What network requirements are confirmed?',whyNow:'Validate the facility timeline.'},unknowns:['Procurement budget']}}
 const state:any={settings:{markets:['Singapore'],industries:['manufacturing'],intervalMinutes:240,enabled:false,maxCandidates:15},nextRunAt:null,run:null,leads:[lead],history:[],sourceCatalogue:[],scheduler:{storage:'temporary local memory',externalWakeConfigured:false}}
 await page.route('**/api/v1/prospecting**',async route=>{
  if(route.request().url().endsWith('/run'))state.run={status:'researching',cursor:0,candidateCount:15,qualifiedCount:0,failures:[],sourceReports:[]}
  await route.fulfill({status:route.request().url().endsWith('/run')?202:200,json:state})
 })
 await page.goto('/lead-ranking')
 const company=page.getByRole('button',{name:'#1 Example Manufacturing',exact:true})
 await company.hover();await expect(page.getByText('Business connectivity',{exact:true})).toBeVisible()
 await company.click()
 const detail=page.getByRole('region',{name:'Research details for Example Manufacturing'})
 await expect(detail.getByRole('heading',{name:'Possible needs and Singtel capabilities'})).toBeVisible()
 await expect(detail.getByRole('link',{name:source.title})).toHaveAttribute('href',source.url)
 await expect(detail).toContainText('Role to identify: IT manager')
 await page.getByRole('button',{name:'Close company details'}).click();await expect(detail).toHaveCount(0)
 await page.getByRole('button',{name:'Research now',exact:true}).click()
 await expect(page.getByRole('status')).toContainText('Researching and validating companies')
 await expect(company).toBeVisible()
})
