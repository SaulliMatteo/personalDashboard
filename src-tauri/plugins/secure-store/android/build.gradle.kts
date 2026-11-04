plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "it.matteo.securestore"
    compileSdk = 36

    defaultConfig {
        // Come l'app (gen/android/app/build.gradle.kts). Keystore con AES-GCM: API 23+.
        minSdk = 24
        consumerProguardFiles("consumer-rules.pro")
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
}

dependencies {
    // Solo l'SDK di Android (KeyStore, javax.crypto) e l'API dei plugin di Tauri.
    implementation(project(":tauri-android"))
}
