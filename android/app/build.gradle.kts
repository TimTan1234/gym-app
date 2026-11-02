plugins {
    id("com.android.application")
}

android {
    namespace = "app.gympal.health"
    compileSdk = 36

    defaultConfig {
        applicationId = "app.gympal.health"
        // Health Connect runs on Android 9 and up (built in from Android 14).
        minSdk = 28
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
}

dependencies {
    implementation("androidx.health.connect:connect-client:1.1.0")
    implementation("androidx.work:work-runtime-ktx:2.12.0")
    implementation("androidx.activity:activity-ktx:1.13.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.11.0")
    testImplementation("junit:junit:4.13.2")
}
