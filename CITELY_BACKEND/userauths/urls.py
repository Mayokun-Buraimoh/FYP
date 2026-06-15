from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import MyTokenObtainPairView, RegisterView, ProfileView, GoogleSignInView

urlpatterns = [
    path("register/", RegisterView.as_view(), name="auth-register"),
    path("login/", MyTokenObtainPairView.as_view(), name="auth-login"),
    path("token/refresh/", TokenRefreshView.as_view(), name="auth-token-refresh"),
    path("profile/<user_id>/", ProfileView.as_view(), name="auth-profile"),
    path("google/", GoogleSignInView.as_view(), name="auth-google"),
]
