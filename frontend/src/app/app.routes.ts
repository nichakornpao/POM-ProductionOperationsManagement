import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './pages/login/login.component';
import { AuthGuard } from './core/guards/auth.guard';
import { ForecastDashboardComponent } from './pages/forecast-dashboard/forecast-dashboard.component';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full'
  },
  {
    path: 'login',
    component: LoginComponent
  },

  // Production role
  {
    path: 'production',
    canActivate: [AuthGuard],
    canActivateChild: [AuthGuard],
    data: { roles: ['production', 'view', 'admin', 'engineer', 'PC', 'QC', 'Gague', 'Cost'] },
    children: [
      {
        path: 'PCPlan',
        loadComponent: () => import('./pages/PC/PCPlan/PCPlan.component').then(m => m.PCPlanComponent),
        data: { roles: ['PC', 'admin'] }
      },
      {
        path: 'ForecastDashboard',
        component: ForecastDashboardComponent,
        data: { roles: ['production', 'PC', 'view', 'admin', 'engineer', 'QC', 'Gague', 'Cost'] }
      },
      {
        path: 'AlgorithmVisualizer',
        loadComponent: () => import('./pages/algorithm-visualizer/algorithm-visualizer.component').then(m => m.AlgorithmVisualizerComponent),
        data: { roles: ['production', 'PC', 'view', 'admin', 'engineer', 'QC', 'Gague', 'Cost'] }
      },
      {
        path: 'PlanList',
        loadComponent: () => import('./pages/PC/PlanList/PlanList.component').then(m => m.PlanListComponent),
        data: { roles: ['production', 'PC', 'view', 'admin', 'engineer', 'QC', 'Gague', 'Cost'] }
      },
      {
        path: 'document-return-issue',
        loadComponent: () => import('./pages/EN/document-return-issue/document-return-issue.component').then(m => m.DocumentReturnIssueComponent),
        data: { roles: ['engineer', 'admin', 'engineering', 'eng', 'en', 'EN'] }
      },
      {
        path: 'engineer-history',
        loadComponent: () => import('./pages/EN/engineer-history/engineer-history.component').then(m => m.EngineerHistoryComponent),
        data: { roles: ['engineer', 'admin', 'engineering', 'eng', 'en', 'EN'] }
      },
      {
        path: 'request',
        loadComponent: () => import('./pages/user/request/request.component').then(m => m.requestComponent),
        data: { roles: ['production', 'admin'] }
      },
      {
        path: 'return',
        loadComponent: () => import('./pages/user/return/return.component').then(m => m.ReturnComponent),
        data: { roles: ['production', 'admin'] }
      },
      {
        path: 'request-history',
        loadComponent: () => import('./pages/user/request-history/request-history.component').then(m => m.RequestHistoryComponent),
        data: { roles: ['production', 'view', 'admin', 'engineer', 'PC', 'QC', 'Gague', 'Cost'] }
      },
      {
        path: 'about-us',
        loadComponent: () => import('./pages/user/about-us/about-us.component').then(m => m.AboutUsComponent),
        data: { roles: ['production', 'admin', 'engineer', 'view'] }
      },
      {
        path: 'historyprint',
        loadComponent: () => import('./pages/user/history-print/history-print.component').then(m => m.HistoryPrintComponent),
        data: { roles: ['production', 'view', 'admin', 'engineer', 'PC', 'QC', 'Gague', 'Cost'] }
      },
      {
        path: 'return-history',
        loadComponent: () => import('./pages/user/return-history/return-history.component').then(m => m.ReturnHistoryComponent),
        data: { roles: ['production', 'view', 'admin', 'engineer', 'PC', 'QC', 'Gague', 'Cost'] }
      }
    ]
  },

  // Purchase role
  {
    path: 'purchase',
    canActivate: [AuthGuard],
    canActivateChild: [AuthGuard],
    data: { roles: ['purchase', 'view', 'admin', 'Cost'] },
    children: [
      {
        path: 'PlanList',
        loadComponent: () => import('./pages/PC/PlanList/PlanList.component').then(m => m.PlanListComponent),
        data: { roles: ['purchase', 'view', 'admin', 'Cost'] }
      },

      {
        path: 'ForecastDashboard',
        component: ForecastDashboardComponent,
        data: { roles: ['purchase', 'view', 'admin', 'Cost'] }
      },
      {
        path: 'detail',
        loadComponent: () => import('./pages/purchase/detail/detail.component').then(m => m.DetailComponent),
        data: { roles: ['purchase', 'view', 'admin'] }
      },
      {
        path: 'detailcasesetup',
        loadComponent: () => import('./pages/purchase/detailcasesetup/detailcasesetup.component').then(m => m.DetailCaseSetupComponent),
        data: { roles: ['purchase', 'view', 'admin'] }
      },
      {
        path: 'returnlist',
        loadComponent: () => import('./pages/purchase/returnlist/returnlist.component').then(m => m.ReturnlistComponent),
        data: { roles: ['purchase', 'view', 'admin'] }
      },
      {
        path: 'request-history',
        loadComponent: () => import('./pages/user/request-history/request-history.component').then(m => m.RequestHistoryComponent),
        data: { roles: ['purchase', 'view', 'admin', 'Cost'] }
      },
      {
        path: 'history-request',
        loadComponent: () => import('./pages/purchase/history-request/history-request.component').then(m => m.HistoryRequestComponent),
        data: { roles: ['purchase', 'view', 'admin'] }
      },
      {
        path: 'return-history',
        loadComponent: () => import('./pages/user/return-history/return-history.component').then(m => m.ReturnHistoryComponent),
        data: { roles: ['purchase', 'view', 'admin', 'Cost'] }
      },
      {
        path: 'historyprint',
        loadComponent: () => import('./pages/user/history-print/history-print.component').then(m => m.HistoryPrintComponent),
        data: { roles: ['purchase', 'view', 'admin', 'Cost'] }
      },
      {
        path: 'add-user',
        loadComponent: () => import('./pages/purchase/add-user/add-user.component').then(m => m.AddUserComponent),
        data: { roles: ['purchase', 'admin'] }
      },

      {
        path: 'analyze',
        loadComponent: () => import('./pages/purchase/analyze/analyze.component').then(m => m.AnalyzeComponent),
        data: { roles: ['purchase', 'view', 'admin', 'Cost'] }
      },
      {
        path: 'analyzeSmartRack',
        loadComponent: () => import('./pages/purchase/analyzeSmartrack/analyzeSmartrack.component').then(m => m.AnalyzeSmartRackComponent),
        data: { roles: ['purchase', 'view', 'admin'] }
      },
      {
        path: 'master-ph',
        loadComponent: () => import('./pages/purchase/MasterPH/MasterPH.component').then(m => m.MasterPHComponent),
        data: { roles: ['purchase', 'view', 'admin', 'Cost'] }
      }
    ],
  },

  {
    path: 'user-dashboard',
    redirectTo: 'production',
    pathMatch: 'full'
  },
  {
    path: 'purchase-dashboard',
    redirectTo: 'purchase',
    pathMatch: 'full'
  },
  {
    path: 'home',
    redirectTo: 'production',
    pathMatch: 'full'
  },
  {
    path: '**',
    redirectTo: 'production'
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
