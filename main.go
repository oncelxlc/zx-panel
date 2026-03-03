package main

import (
	"fmt"
	"time"
)

func main() {
	switch time.Now().Weekday() {
	case time.Monday:
		fmt.Println("It's Monday.")
		break
	case time.Tuesday:
		fmt.Println("It's Tuesday.")
		break
	case time.Wednesday:
		fmt.Println("It's Wednesday.")
		break
	case time.Thursday:
		fmt.Println("It's Thursday.")
		break
	case time.Friday:
		fmt.Println("It's Friday.")
		break
	case time.Saturday:
		fmt.Println("It's Saturday.")
		break
	case time.Sunday:
		fmt.Println("It's Sunday.")
		break
	default:
		fmt.Println("Unknown day.")
	}
}
