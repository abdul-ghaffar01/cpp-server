#include <iostream>
using namespace std;

int main() {
    int choice;
    
    while (true) { 
        cout << "Menu:\n1. Say Hello\n2. Show Time\n3. Exit\nEnter your choice: ";
        cin >> choice;

        if (choice == 1) {
            cout << "Hello, welcome to my program!\n";
        } else if (choice == 2) {
            cout << "Current time is: " << __TIME__ << "\n";
        } else if (choice == 3) {
            cout << "Exiting...\n";
            break;
        } else {
            cout << "Invalid choice, try again.\n";
        }
    }

    return 0;
}
